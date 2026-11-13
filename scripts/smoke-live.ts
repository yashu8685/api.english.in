/**
 * Live service checks — run against the real `DATABASE_URL` and `OPENAI_*`
 * values in `api/.env`.
 *
 *   npm run smoke:live
 *
 * It signs up a throwaway user in-process, checks the database, streams a turn
 * from the tutor, synthesises a British phrase with OpenAI TTS and sends it
 * back through the speaking endpoint with no transcript. That exercises the
 * exact production path: Whisper transcription → scoring → optional Azure
 * phoneme assessment. The throwaway user is deleted afterwards.
 *
 * Nothing here is part of the normal test suite: `npm test` never calls the
 * network.
 */
import { eq, sql } from "drizzle-orm";
import { app } from "../src/app.js";
import { db, pool } from "../src/db/client.js";
import { user, words } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { phonemeAssessmentEnabled } from "../src/lib/azure.js";

const ORIGIN = env.WEB_ORIGIN;
const password = "password123";
const email = `live-smoke-${crypto.randomUUID()}@example.com`;

let cookie = "";

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (cookie) headers.set("Cookie", cookie);
  return await app.request(path, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown";
  }
}

function dataFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => {
      try {
        return JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((value): value is Record<string, unknown> => value !== null);
}

function pass(label: string, detail: string): void {
  console.log(`  ✓ ${label.padEnd(9)} ${detail}`);
}

let skipped = 0;

function skip(label: string, detail: string): void {
  skipped += 1;
  console.log(`  – ${label.padEnd(9)} ${detail}`);
}

function fail(label: string, detail: string): never {
  console.error(`  ✗ ${label.padEnd(9)} ${detail}`);
  throw new Error(`${label} check failed`);
}

async function main(): Promise<void> {
  console.log("\nFluent live checks\n");

  /* ── database ─────────────────────────────────────────────────────────── */

  const [deck] = await db.select({ count: sql<number>`count(*)::int` }).from(words);
  if (!deck || deck.count === 0) {
    fail("database", "connected, but the deck is empty — run `npm run db:seed`");
  }
  pass("database", `${hostOf(env.DATABASE_URL)} · ${deck.count} words`);

  /* ── auth ─────────────────────────────────────────────────────────────── */

  const signUp = await api("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Live Smoke", email, password })
  });

  if (!signUp.ok) {
    fail("auth", `sign-up returned ${signUp.status}: ${(await signUp.text()).slice(0, 200)}`);
  }

  cookie = (signUp.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
  if (!cookie) fail("auth", "sign-up succeeded but no session cookie was returned");
  pass("auth", "sign-up + cookie session");

  const me = await api("/api/me");
  if (!me.ok) fail("auth", `/api/me returned ${me.status}`);
  await me.text();

  /* ── speaking setup ───────────────────────────────────────────────────── */

  const speaking = await json<{
    phrases: Array<{ id: string; text: string }>;
    capabilities: { transcription: boolean; phonemes: boolean };
  }>(await api("/api/speaking"));

  const phrase = speaking.phrases[0];
  if (!phrase) fail("speaking", "no seeded speaking phrases");

  if (!speaking.capabilities.transcription) {
    skip("tutor", "OPENAI_API_KEY is empty — cannot check live replies");
    skip("speech", "OPENAI_API_KEY is empty — cannot transcribe a clip");
    return;
  }

  /* ── tutor (SSE, real model) ──────────────────────────────────────────── */

  const streamResponse = await api("/api/tutor/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      scenario: "cafe",
      message: "Hello! I would like a flat white, please."
    })
  });

  if (!streamResponse.ok) {
    fail("tutor", `stream returned ${streamResponse.status}: ${(await streamResponse.text()).slice(0, 200)}`);
  }

  const frames = dataFrames(await streamResponse.text());
  const meta = frames.find((frame) => frame.type === "meta");
  const done = frames.find((frame) => frame.type === "done");

  if (!done) fail("tutor", "stream ended without a done event");
  if (meta?.provider !== "openai") {
    fail(
      "tutor",
      `provider was ${String(meta?.provider)} — the API fell back to the local coach. Check OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL.`
    );
  }

  pass("tutor", `streamed ${String(done.reply).length} chars via ${String(meta.provider)}`);

  /* ── speech-to-text (TTS round trip) ──────────────────────────────────── */

  const ttsBase = env.OPENAI_BASE_URL.replace(/\/+$/, "");
  const tts = await fetch(`${ttsBase}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY?.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "alloy",
      input: phrase.text,
      response_format: "wav"
    }),
    signal: AbortSignal.timeout(45_000)
  });

  if (!tts.ok) {
    fail("speech", `TTS returned ${tts.status}: ${(await tts.text()).slice(0, 200)}`);
  }

  const audio = new Uint8Array(await tts.arrayBuffer());
  if (audio.byteLength === 0) fail("speech", "TTS returned an empty clip");

  const form = new FormData();
  form.append("phraseId", phrase.id);
  form.append("saveAudio", "false");
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "smoke.wav");

  const attempt = await api("/api/speaking/attempt", { method: "POST", body: form });
  const attemptBody = await json<{
    score: number;
    transcript: string;
    assessment: { provider: string; phonemes: Array<unknown> };
    xpGained: number;
  }>(attempt);

  if (!attempt.ok) {
    fail("speech", `attempt returned ${attempt.status}: ${JSON.stringify(attemptBody).slice(0, 250)}`);
  }

  if (!attemptBody.transcript) fail("speech", "the server returned an empty transcript");

  pass(
    "speech",
    `whisper heard ${JSON.stringify(attemptBody.transcript.slice(0, 60))} · score ${attemptBody.score}% · +${attemptBody.xpGained} XP`
  );

  /* ── phonemes (optional) ──────────────────────────────────────────────── */

  if (!phonemeAssessmentEnabled()) {
    skip("phonemes", "AZURE_SPEECH_KEY / AZURE_SPEECH_REGION are empty — word-accuracy mode");
  } else if (attemptBody.assessment.provider !== "azure") {
    fail("phonemes", "Azure is configured but the attempt fell back to word accuracy");
  } else {
    pass(
      "phonemes",
      `azure scored ${attemptBody.assessment.phonemes.length} words · pronunciation ${attemptBody.score}%`
    );
  }
}

try {
  await main();
  console.log(
    skipped === 0
      ? "\nAll live checks passed.\n"
      : `\nLive checks passed, ${skipped} skipped. Fill in api/.env and run again to cover them.\n`
  );
} catch (error) {
  console.error(`\nLive checks failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  // Remove the throwaway account (attempts cascade). Best effort only.
  await db.delete(user).where(eq(user.email, email)).catch(() => undefined);
  await pool.end();
}
