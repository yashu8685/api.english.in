import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool } from "../src/db/client.js";

const ORIGIN = "http://localhost:5173";
const EMAIL = `api-test-${crypto.randomUUID()}@example.com`;
const PASSWORD = "password123";

let cookie = "";
let wordId = "";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (cookie) headers.set("Cookie", cookie);
  return await app.request(path, { ...init, headers });
}

async function jsonBody(response: Response): Promise<any> {
  return response.json();
}

function json(path: string, method: string, body: unknown): Promise<Response> {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function cookieFrom(response: Response): string {
  return (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

beforeAll(async () => {
  const response = await json("/api/auth/sign-up/email", "POST", {
    name: "API Test",
    email: EMAIL,
    password: PASSWORD
  });

  expect(response.status).toBe(200);
  cookie = cookieFrom(response);
  expect(cookie).not.toBe("");
});

afterAll(async () => {
  await pool.end();
});

describe("health", () => {
  it("reports liveness without a session", async () => {
    const response = await app.request("/health");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, service: "fluent-api" });
  });
});

describe("auth", () => {
  it("rejects an unknown route with the standard error shape", async () => {
    // Outside /api, so it reaches the notFound handler instead of requireAuth.
    const response = await app.request("/nope");
    const body = await jsonBody(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("refuses duplicate sign-ups", async () => {
    const response = await json("/api/auth/sign-up/email", "POST", {
      name: "API Test",
      email: EMAIL,
      password: PASSWORD
    });

    expect(response.status).toBe(422);
  });

  it("rejects a wrong password", async () => {
    const response = await json("/api/auth/sign-in/email", "POST", {
      email: EMAIL,
      password: "not-the-password"
    });

    expect(response.status).toBe(401);
  });

  it("does not expose protected routes without a session", async () => {
    const saved = cookie;
    cookie = "";

    for (const path of [
      "/api/me",
      "/api/stats",
      "/api/vocabulary",
      "/api/lessons",
      "/api/speaking",
      "/api/listening",
      "/api/tutor/history"
    ]) {
      const response = await request(path);
      const body = await jsonBody(response);

      expect(response.status, path).toBe(401);
      expect(body.error.code).toBe("unauthorized");
    }

    cookie = saved;
  });
});

describe("profile", () => {
  it("returns the user and a lazily created profile", async () => {
    const response = await request("/api/me");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ name: "API Test", email: EMAIL });
    expect(body.profile).toMatchObject({
      level: "B1",
      dailyGoal: 10,
      xp: 0,
      streak: 0,
      lastStudyOn: null
    });
  });

  it("updates display name, level and daily goal", async () => {
    const response = await json("/api/me", "PATCH", {
      displayName: "Alex R.",
      level: "B2",
      dailyGoal: 15
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({
      displayName: "Alex R.",
      level: "B2",
      dailyGoal: 15
    });
  });

  it("validates the payload", async () => {
    const response = await json("/api/me", "PATCH", { dailyGoal: 500 });
    const body = await jsonBody(response);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_error");
    expect(body.error.details).toBeTruthy();
  });
});

describe("vocabulary", () => {
  it("returns the whole deck with no progress for a new learner", async () => {
    const response = await request("/api/vocabulary");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.cards).toHaveLength(12);
    expect(body.newCount).toBe(12);
    expect(body.dueCount).toBe(0);
    expect(body.cards.every((card: { progress: unknown }) => card.progress === null)).toBe(true);

    wordId = body.cards[0].id;
  });

  it("grades a card, schedules it and awards XP", async () => {
    const response = await json("/api/vocabulary/review", "POST", {
      wordId,
      quality: "good"
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.xpGained).toBe(10);
    expect(body.totalXp).toBe(10);
    expect(body.streak).toBe(1);
    expect(body.card.progress).toMatchObject({ reps: 1, intervalDays: 2, lapses: 0, ease: 2.5 });
    expect(body.card.due).toBe(false);
  });

  it("updates the deck and today's stats", async () => {
    const response = await request("/api/stats");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      xp: 10,
      streak: 1,
      dailyGoal: 15,
      cardsToday: 1,
      dueCount: 0,
      newCount: 11,
      matureCount: 0,
      totalWords: 12
    });
  });

  it("rejects unknown words and invalid ratings", async () => {
    const missing = await json("/api/vocabulary/review", "POST", {
      wordId: crypto.randomUUID(),
      quality: "good"
    });
    expect(missing.status).toBe(404);
    expect((await jsonBody(missing)).error.code).toBe("word_not_found");

    const invalid = await json("/api/vocabulary/review", "POST", {
      wordId,
      quality: "perfect"
    });
    expect(invalid.status).toBe(422);
    expect((await jsonBody(invalid)).error.code).toBe("validation_error");
  });
});

describe("lessons", () => {
  it("lists the seeded lessons", async () => {
    const response = await request("/api/lessons");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.lessons).toHaveLength(3);
    for (const lesson of body.lessons) {
      expect(lesson.questionCount).toBeGreaterThan(0);
      expect(lesson.attempts).toBe(0);
      expect(lesson.bestScore).toBeNull();
    }
  });

  it("returns the lesson content and quiz", async () => {
    const response = await request("/api/lessons/present-perfect-vs-past-simple");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.slug).toBe("present-perfect-vs-past-simple");
    expect(body.content.sections.length).toBeGreaterThan(0);
    expect(body.content.quiz.length).toBe(body.questionCount);
  });

  it("returns 404 for an unknown lesson", async () => {
    const response = await request("/api/lessons/does-not-exist");
    expect(response.status).toBe(404);
    expect((await jsonBody(response)).error.code).toBe("lesson_not_found");
  });

  it("records an attempt, awards XP and updates the best score", async () => {
    const response = await json("/api/lessons/present-perfect-vs-past-simple/attempts", "POST", {
      score: 3,
      total: 4
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, xpGained: 19, totalXp: 29, streak: 1 });

    const list = await request("/api/lessons");
    const lessons = (await jsonBody(list)).lessons as Array<{
      slug: string;
      attempts: number;
      bestScore: number | null;
    }>;
    const lesson = lessons.find((item) => item.slug === "present-perfect-vs-past-simple");

    expect(lesson).toMatchObject({ attempts: 1, bestScore: 75 });

    const stats = await jsonBody(await request("/api/stats"));
    expect(stats).toMatchObject({ xp: 29, lessonsCompleted: 1, totalLessons: 3 });
  });

  it("rejects an impossible score", async () => {
    const response = await json("/api/lessons/conditionals-1-2-3/attempts", "POST", {
      score: 5,
      total: 4
    });

    expect(response.status).toBe(422);
    expect((await jsonBody(response)).error.code).toBe("validation_error");
  });
});

describe("speaking", () => {
  let phraseId = "";
  let phraseText = "";

  it("lists the seeded British phrases", async () => {
    const response = await request("/api/speaking");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.phrases).toHaveLength(10);
    expect(
      body.phrases.every(
        (phrase: { attempts: number; bestScore: number | null }) =>
          phrase.attempts === 0 && phrase.bestScore === null
      )
    ).toBe(true);

    const phrase = body.phrases[0];
    phraseId = phrase.id;
    phraseText = phrase.text;
    expect(phrase.level).toBe("B1");
    expect(phrase.focus.length).toBeGreaterThan(0);
    expect(body.capabilities).toMatchObject({ transcription: false, phonemes: false });
  });

  it("scores a spoken transcript, saves it and awards XP", async () => {
    const before = await jsonBody(await request("/api/stats"));

    const response = await json("/api/speaking/attempt", "POST", {
      phraseId,
      transcript: phraseText
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.score).toBe(100);
    expect(body.xpGained).toBe(15);
    expect(body.totalXp).toBe(before.xp + 15);
    expect(body.streak).toBe(1);
    expect(body.words.every((word: { matched: boolean }) => word.matched)).toBe(true);
    expect(body.audioUrl).toBeNull();
    expect(body.assessment).toMatchObject({ provider: "word-accuracy", phonemes: [] });

    const list = await jsonBody(await request("/api/speaking"));
    const phrase = list.phrases.find((item: { id: string }) => item.id === phraseId);
    expect(phrase).toMatchObject({ attempts: 1, bestScore: 100 });

    const stats = await jsonBody(await request("/api/stats"));
    expect(stats.xp).toBe(before.xp + 15);
  });

  it("reduces XP for repeat attempts on the same day", async () => {
    const response = await json("/api/speaking/attempt", "POST", {
      phraseId,
      transcript: phraseText
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.score).toBe(100);
    expect(body.xpGained).toBe(2);
  });

  it("rejects unknown phrases and empty transcripts", async () => {
    const missing = await json("/api/speaking/attempt", "POST", {
      phraseId: crypto.randomUUID(),
      transcript: "hello"
    });
    expect(missing.status).toBe(404);
    expect((await jsonBody(missing)).error.code).toBe("phrase_not_found");

    const empty = await json("/api/speaking/attempt", "POST", { phraseId, transcript: "   " });
    expect(empty.status).toBe(422);
    expect((await jsonBody(empty)).error.code).toBe("validation_error");
  });

  it("accepts a recorded attempt, stores it on request and deletes it", async () => {
    const list = await jsonBody(await request("/api/speaking"));
    const target = list.phrases[1] as { id: string; text: string };

    // A minimal PCM WAV header is enough: Azure is disabled in tests, so the
    // audio is only stored and served back.
    const wav = new Uint8Array(44 + 320);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVE"), 8);
    wav.set(new TextEncoder().encode("data"), 36);

    const form = new FormData();
    form.append("phraseId", target.id);
    form.append("transcript", target.text);
    form.append("saveAudio", "true");
    form.append("audio", new Blob([wav], { type: "audio/wav" }), "attempt.wav");

    const response = await request("/api/speaking/attempt", { method: "POST", body: form });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.score).toBe(100);
    expect(body.attemptId).toBeTruthy();
    expect(body.audioUrl).toBe(`/api/speaking/attempts/${body.attemptId}/audio`);
    expect(body.assessment.provider).toBe("word-accuracy");

    const audio = await request(body.audioUrl);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    expect((await audio.arrayBuffer()).byteLength).toBe(wav.byteLength);

    const removed = await request(`/api/speaking/attempts/${body.attemptId}`, {
      method: "DELETE"
    });
    expect(removed.status).toBe(200);

    const gone = await request(body.audioUrl);
    expect(gone.status).toBe(404);
    expect((await jsonBody(gone)).error.code).toBe("audio_not_found");
  });

  it("asks for a transcript when there is no key and no Azure configured", async () => {
    const list = await jsonBody(await request("/api/speaking"));
    const target = list.phrases[2] as { id: string; text: string };

    const form = new FormData();
    form.append("phraseId", target.id);
    form.append("saveAudio", "false");
    form.append("audio", new Blob([new Uint8Array(64)], { type: "audio/wav" }), "attempt.wav");

    const response = await request("/api/speaking/attempt", { method: "POST", body: form });
    const body = await jsonBody(response);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("transcript_required");
  });
});

describe("listening", () => {
  let clipId = "";
  let clipText = "";

  it("lists the seeded dictation clips", async () => {
    const response = await request("/api/listening");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.clips).toHaveLength(8);
    expect(
      body.clips.every(
        (clip: { attempts: number; bestScore: number | null }) =>
          clip.attempts === 0 && clip.bestScore === null
      )
    ).toBe(true);

    const clip = body.clips[0];
    clipId = clip.id;
    clipText = clip.text;
    expect(clip.hint.length).toBeGreaterThan(0);
  });

  it("scores an exact dictation and awards XP", async () => {
    const before = await jsonBody(await request("/api/stats"));

    const response = await json("/api/listening/attempt", "POST", {
      clipId,
      transcript: clipText
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.score).toBe(100);
    expect(body.xpGained).toBe(15);
    expect(body.totalXp).toBe(before.xp + 15);
    expect(body.feedback).toContain("Perfect dictation");

    const list = await jsonBody(await request("/api/listening"));
    const clip = list.clips.find((item: { id: string }) => item.id === clipId);
    expect(clip).toMatchObject({ attempts: 1, bestScore: 100 });
  });

  it("reduces XP for a repeat dictation on the same day", async () => {
    const response = await json("/api/listening/attempt", "POST", {
      clipId,
      transcript: clipText
    });
    expect((await jsonBody(response)).xpGained).toBe(2);
  });

  it("rejects unknown clips and empty transcripts", async () => {
    const missing = await json("/api/listening/attempt", "POST", {
      clipId: crypto.randomUUID(),
      transcript: "hello"
    });
    expect(missing.status).toBe(404);
    expect((await jsonBody(missing)).error.code).toBe("clip_not_found");

    const empty = await json("/api/listening/attempt", "POST", { clipId, transcript: "  " });
    expect(empty.status).toBe(422);
  });
});

describe("tutor", () => {
  it("starts a scenario with an opener and no messages", async () => {
    const response = await request("/api/tutor/history?scenario=cafe");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.scenario).toBe("cafe");
    expect(body.opener.length).toBeGreaterThan(0);
    expect(body.messages).toEqual([]);
  });

  it("replies locally and corrects Americanisms without an API key", async () => {
    const response = await json("/api/tutor/chat", "POST", {
      scenario: "cafe",
      message: "I would like a color coffee in an apartment"
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.provider).toBe("local");
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body.correction).toContain("colour");
    expect(body.correction).toContain("flat");
  });

  it("persists the exchange and can start over", async () => {
    const history = await jsonBody(await request("/api/tutor/history?scenario=cafe"));

    expect(history.messages).toHaveLength(2);
    expect(history.messages[0]).toMatchObject({ role: "user" });
    expect(history.messages[1]).toMatchObject({ role: "assistant" });

    const cleared = await request("/api/tutor/history?scenario=cafe", { method: "DELETE" });
    expect(cleared.status).toBe(200);

    const after = await jsonBody(await request("/api/tutor/history?scenario=cafe"));
    expect(after.messages).toEqual([]);
  });

  it("streams a reply over server-sent events and stores the turn", async () => {
    const response = await request("/api/tutor/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "travel",
        message: "I would like a return ticket to Bath"
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const stream = await response.text();
    expect(stream).toContain("event: meta");
    expect(stream).toContain('"provider":"local"');
    expect(stream).toContain("event: delta");
    expect(stream).toContain("event: done");
    expect(stream).toContain('"type":"done"');

    const history = await jsonBody(await request("/api/tutor/history?scenario=travel"));
    expect(history.messages).toHaveLength(2);
    expect(history.messages[0].content).toBe("I would like a return ticket to Bath");
    expect(history.messages[1].role).toBe("assistant");
    expect(history.messages[1].content.length).toBeGreaterThan(0);
  });

  it("rejects unknown scenarios and empty messages", async () => {
    const scenario = await request("/api/tutor/history?scenario=spaceship");
    expect(scenario.status).toBe(422);

    const empty = await json("/api/tutor/chat", "POST", { scenario: "cafe", message: "   " });
    expect(empty.status).toBe(422);
    expect((await jsonBody(empty)).error.code).toBe("validation_error");
  });
});

describe("sign out", () => {
  it("invalidates the session cookie", async () => {
    const response = await request("/api/auth/sign-out", { method: "POST" });
    expect(response.status).toBe(200);

    const me = await request("/api/me");
    expect(me.status).toBe(401);
  });
});
