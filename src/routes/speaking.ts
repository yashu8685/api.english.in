import { Hono } from "hono";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { speakingAttempts, speakingPhrases } from "../db/schema.js";
import {
  speakingAttemptSchema,
  speakingAudioAttemptSchema,
  type Level,
  type SpeechAssessment
} from "../../contracts.js";
import type { AppEnv } from "../types.js";
import { awardXp } from "../lib/activity.js";
import { assessPronunciation, phonemeAssessmentEnabled, wordAccuracyAssessment } from "../lib/azure.js";
import { AppError } from "../lib/errors.js";
import { scoreSpeech, xpForSpeech } from "../lib/speech.js";
import { audioStorageEnabled, deleteAudio, readAudio, saveAudio } from "../lib/storage.js";
import { transcribeAudio, transcriptionEnabled } from "../lib/transcribe.js";
import { parseJson } from "../lib/validation.js";

export const speakingRoutes = new Hono<AppEnv>();

/** 8 MB is roughly four minutes of 16 kHz mono WAV. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

interface AttemptInput {
  phraseId: string;
  transcript: string;
  saveAudio: boolean;
}

interface UploadedAudio {
  data: Buffer;
  mime: string;
}

function audioFilename(mime: string): string {
  if (mime === "audio/wav") return "attempt.wav";
  if (mime === "audio/ogg") return "attempt.ogg";
  if (mime === "audio/mp4") return "attempt.m4a";
  if (mime === "audio/mpeg") return "attempt.mp3";
  return "attempt.webm";
}

function assessmentFeedback(base: string, assessment: SpeechAssessment): string {
  if (assessment.provider !== "azure") return base;

  const parts: string[] = [
    `Phoneme score ${assessment.pronunciation ?? "—"}%` +
      (assessment.accuracy !== null ? ` (accuracy ${assessment.accuracy}%` : " (") +
      (assessment.fluency !== null ? `, fluency ${assessment.fluency}%` : "") +
      ")."
  ];

  const weak = assessment.phonemes
    .filter((phoneme) => phoneme.accuracy !== null && phoneme.accuracy < 70)
    .slice(0, 3);

  if (weak.length > 0) {
    parts.push(
      `Focus on the sounds in ${weak.map((phoneme) => `“${phoneme.word}”`).join(", ")}.`
    );
    parts.push(base);
  } else {
    parts.push("Clear, consistent British pronunciation — keep that rhythm.");
  }

  return parts.join(" ");
}

async function parseAttempt(c: Parameters<typeof parseJson>[0]): Promise<{
  input: AttemptInput;
  audio: UploadedAudio | null;
}> {
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();

  if (!contentType.startsWith("multipart/form-data")) {
    const json = await parseJson(c, speakingAttemptSchema);
    return { input: { ...json, saveAudio: false }, audio: null };
  }

  const body = await c.req.parseBody();
  const rawPhraseId = body.phraseId;
  const rawTranscript = typeof body.transcript === "string" ? body.transcript : "";
  const rawSaveAudio = typeof body.saveAudio === "string" ? body.saveAudio : "false";

  const parsed = speakingAudioAttemptSchema.safeParse({
    phraseId: rawPhraseId,
    transcript: rawTranscript.trim() === "" ? undefined : rawTranscript,
    saveAudio: rawSaveAudio === "true" ? "true" : "false"
  });

  if (!parsed.success) {
    throw new AppError(422, "validation_error", "Check the attempt and try again.", {
      issues: parsed.error.issues
    });
  }

  const file = body.audio;
  if (file === undefined) {
    return {
      input: {
        phraseId: parsed.data.phraseId,
        transcript: parsed.data.transcript ?? "",
        saveAudio: parsed.data.saveAudio
      },
      audio: null
    };
  }

  if (typeof file === "string") {
    throw new AppError(422, "invalid_audio", "Send the recording as a file field called `audio`.");
  }

  if (file.size === 0) {
    throw new AppError(422, "invalid_audio", "That recording was empty. Try again.");
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new AppError(413, "audio_too_large", "Keep recordings under about four minutes.");
  }

  const mime = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mime.startsWith("audio/")) {
    throw new AppError(422, "invalid_audio", "That file is not an audio recording.");
  }

  return {
    input: {
      phraseId: parsed.data.phraseId,
      transcript: parsed.data.transcript ?? "",
      saveAudio: parsed.data.saveAudio
    },
    audio: { data: Buffer.from(await file.arrayBuffer()), mime }
  };
}

speakingRoutes.get("/speaking", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: speakingPhrases.id,
      slug: speakingPhrases.slug,
      text: speakingPhrases.text,
      focus: speakingPhrases.focus,
      tip: speakingPhrases.tip,
      level: speakingPhrases.level,
      attempts: sql<number>`count(${speakingAttempts.id})::int`,
      bestScore: sql<number | null>`max(${speakingAttempts.score})::int`
    })
    .from(speakingPhrases)
    .leftJoin(
      speakingAttempts,
      and(
        eq(speakingAttempts.phraseId, speakingPhrases.id),
        eq(speakingAttempts.userId, user.id)
      )
    )
    .groupBy(speakingPhrases.id)
    .orderBy(asc(speakingPhrases.level), asc(speakingPhrases.slug));

  return c.json({
    phrases: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      text: row.text,
      focus: row.focus,
      tip: row.tip,
      level: row.level as Level,
      attempts: row.attempts,
      bestScore: row.bestScore ?? null
    })),
    capabilities: {
      transcription: transcriptionEnabled(),
      phonemes: phonemeAssessmentEnabled(),
      storage: audioStorageEnabled()
    }
  });
});

speakingRoutes.post("/speaking/attempt", async (c) => {
  const user = c.get("user");
  const { input, audio } = await parseAttempt(c);

  const phrase = await db.query.speakingPhrases.findFirst({
    where: eq(speakingPhrases.id, input.phraseId)
  });
  if (!phrase) {
    throw new AppError(404, "phrase_not_found", "That speaking phrase does not exist.");
  }

  // Phoneme assessment needs the clip; it never blocks the attempt.
  const azure = audio
    ? await assessPronunciation({
        data: audio.data,
        mime: audio.mime,
        referenceText: phrase.text
      })
    : null;
  const assessment = azure?.assessment ?? wordAccuracyAssessment();

  // Recording without a browser transcript: Azure already recognised the
  // words, otherwise ask the transcription model (which needs a key).
  let transcript = input.transcript.trim();
  if (transcript === "") {
    if (!audio) {
      throw new AppError(422, "transcript_required", "Say or type the phrase first.");
    }
    transcript =
      azure?.displayText ||
      (await transcribeAudio({
        data: audio.data,
        mime: audio.mime,
        filename: audioFilename(audio.mime)
      }));
  }

  const result = scoreSpeech(phrase.text, transcript);

  const score =
    assessment.pronunciation !== null
      ? Math.max(0, Math.min(100, Math.round(assessment.pronunciation)))
      : result.score;

  // Full XP on the first attempt at a phrase each day; repeats are practice
  // and still count towards the streak, but cannot be farmed for points.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [today] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(speakingAttempts)
    .where(
      and(
        eq(speakingAttempts.userId, user.id),
        eq(speakingAttempts.phraseId, phrase.id),
        gte(speakingAttempts.createdAt, startOfDay)
      )
    );

  const firstToday = (today?.count ?? 0) === 0;
  const xp = firstToday ? xpForSpeech(score) : 2;

  // Persist the clip only when the learner opted in and storage is configured.
  let storedPath: string | null = null;
  if (audio && input.saveAudio && audioStorageEnabled()) {
    try {
      storedPath = (await saveAudio(audio.data, audio.mime)).path;
    } catch (error) {
      console.error("could not store speaking recording:", error);
    }
  }

  const outcome = await db
    .transaction(async (tx) => {
      const [attempt] = await tx
        .insert(speakingAttempts)
        .values({
          userId: user.id,
          phraseId: phrase.id,
          score,
          pronunciationScore: assessment.pronunciation,
          transcript,
          audioPath: storedPath,
          audioMime: storedPath && audio ? audio.mime : null,
          assessment
        })
        .returning({ id: speakingAttempts.id });

      if (!attempt) {
        throw new AppError(500, "attempt_failed", "Could not save that attempt. Try again.");
      }

      const profile = await awardXp(tx, user.id, xp);
      return { attemptId: attempt.id, profile };
    })
    .catch(async (error: unknown) => {
      // Never leave a stored clip behind if the attempt row was not written.
      await deleteAudio(storedPath);
      throw error;
    });

  return c.json({
    attemptId: outcome.attemptId,
    score,
    words: result.words,
    feedback: assessmentFeedback(result.feedback, assessment),
    assessment,
    audioUrl: storedPath ? `/api/speaking/attempts/${outcome.attemptId}/audio` : null,
    xpGained: xp,
    totalXp: outcome.profile.xp,
    streak: outcome.profile.streak
  });
});

speakingRoutes.get("/speaking/attempts/:id/audio", async (c) => {
  const user = c.get("user");
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) {
    throw new AppError(404, "audio_not_found", "That recording is not available.");
  }

  const attempt = await db.query.speakingAttempts.findFirst({
    where: and(eq(speakingAttempts.id, id.data), eq(speakingAttempts.userId, user.id))
  });

  if (!attempt || !attempt.audioPath) {
    throw new AppError(404, "audio_not_found", "That recording is not available.");
  }

  const stored = await readAudio(attempt.audioPath);
  if (!stored) {
    throw new AppError(404, "audio_not_found", "That recording is no longer on disk.");
  }

  return new Response(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": stored.mime,
      "Content-Length": String(stored.data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline"
    }
  });
});

speakingRoutes.delete("/speaking/attempts/:id", async (c) => {
  const user = c.get("user");
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) {
    throw new AppError(404, "attempt_not_found", "That attempt does not exist.");
  }

  const attempt = await db.query.speakingAttempts.findFirst({
    where: and(eq(speakingAttempts.id, id.data), eq(speakingAttempts.userId, user.id))
  });

  if (!attempt) {
    throw new AppError(404, "attempt_not_found", "That attempt does not exist.");
  }

  await deleteAudio(attempt.audioPath);
  await db.delete(speakingAttempts).where(eq(speakingAttempts.id, attempt.id));

  return c.json({ ok: true });
});
