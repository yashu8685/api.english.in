import { Hono } from "hono";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { dictationAttempts, dictationClips } from "../db/schema.js";
import { dictationAttemptSchema, type Level } from "../../contracts.js";
import type { AppEnv } from "../types.js";
import { awardXp } from "../lib/activity.js";
import { AppError } from "../lib/errors.js";
import { scoreSpeech, xpForSpeech } from "../lib/speech.js";
import { parseJson } from "../lib/validation.js";

export const listeningRoutes = new Hono<AppEnv>();

listeningRoutes.get("/listening", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: dictationClips.id,
      slug: dictationClips.slug,
      text: dictationClips.text,
      hint: dictationClips.hint,
      level: dictationClips.level,
      attempts: sql<number>`count(${dictationAttempts.id})::int`,
      bestScore: sql<number | null>`max(${dictationAttempts.score})::int`
    })
    .from(dictationClips)
    .leftJoin(
      dictationAttempts,
      and(
        eq(dictationAttempts.clipId, dictationClips.id),
        eq(dictationAttempts.userId, user.id)
      )
    )
    .groupBy(dictationClips.id)
    .orderBy(asc(dictationClips.level), asc(dictationClips.slug));

  return c.json({
    clips: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      text: row.text,
      hint: row.hint,
      level: row.level as Level,
      attempts: row.attempts,
      bestScore: row.bestScore ?? null
    }))
  });
});

listeningRoutes.post("/listening/attempt", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c, dictationAttemptSchema);

  const clip = await db.query.dictationClips.findFirst({
    where: eq(dictationClips.id, input.clipId)
  });
  if (!clip) {
    throw new AppError(404, "clip_not_found", "That dictation clip does not exist.");
  }

  const result = scoreSpeech(clip.text, input.transcript, "dictation");

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [today] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dictationAttempts)
    .where(
      and(
        eq(dictationAttempts.userId, user.id),
        eq(dictationAttempts.clipId, clip.id),
        gte(dictationAttempts.createdAt, startOfDay)
      )
    );

  const firstToday = (today?.count ?? 0) === 0;
  const xp = firstToday ? xpForSpeech(result.score) : 2;

  const profile = await db.transaction(async (tx) => {
    await tx.insert(dictationAttempts).values({
      userId: user.id,
      clipId: clip.id,
      transcript: input.transcript,
      score: result.score
    });

    return awardXp(tx, user.id, xp);
  });

  return c.json({
    score: result.score,
    words: result.words,
    feedback: result.feedback,
    xpGained: xp,
    totalXp: profile.xp,
    streak: profile.streak
  });
});
