import { Hono } from "hono";
import { db } from "../db/index.js";
import { userWords, words } from "../db/schema.js";
import { reviewCardSchema, type Level, type VocabularyCard } from "../../contracts.js";
import { and, asc, eq } from "drizzle-orm";
import type { AppEnv } from "../types.js";
import { awardXp } from "../lib/activity.js";
import { AppError } from "../lib/errors.js";
import { schedule } from "../lib/srs.js";
import { parseJson } from "../lib/validation.js";

export const vocabularyRoutes = new Hono<AppEnv>();

type JoinedRow = {
  id: string;
  term: string;
  pos: string;
  ipa: string | null;
  meaning: string;
  example: string;
  synonyms: string;
  level: string;
  ease: number | null;
  intervalDays: number | null;
  reps: number | null;
  lapses: number | null;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
};

function toCardDto(row: JoinedRow, now = new Date()): VocabularyCard {
  const hasProgress = row.ease !== null && row.dueAt !== null;

  return {
    id: row.id,
    term: row.term,
    pos: row.pos,
    ipa: row.ipa,
    meaning: row.meaning,
    example: row.example,
    synonyms: row.synonyms,
    level: row.level as Level,
    progress: hasProgress
      ? {
          ease: row.ease as number,
          intervalDays: row.intervalDays ?? 0,
          reps: row.reps ?? 0,
          lapses: row.lapses ?? 0,
          dueAt: (row.dueAt as Date).toISOString(),
          lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null
        }
      : null,
    due: !hasProgress || (row.dueAt as Date).getTime() <= now.getTime()
  };
}

vocabularyRoutes.get("/vocabulary", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: words.id,
      term: words.term,
      pos: words.pos,
      ipa: words.ipa,
      meaning: words.meaning,
      example: words.example,
      synonyms: words.synonyms,
      level: words.level,
      ease: userWords.ease,
      intervalDays: userWords.intervalDays,
      reps: userWords.reps,
      lapses: userWords.lapses,
      dueAt: userWords.dueAt,
      lastReviewedAt: userWords.lastReviewedAt
    })
    .from(words)
    .leftJoin(userWords, and(eq(userWords.wordId, words.id), eq(userWords.userId, user.id)))
    .orderBy(asc(words.term));

  const cards = rows.map((row) => toCardDto(row));

  return c.json({
    cards,
    dueCount: cards.filter((card) => card.progress !== null && card.due).length,
    newCount: cards.filter((card) => card.progress === null).length
  });
});

vocabularyRoutes.post("/vocabulary/review", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c, reviewCardSchema);

  const result = await db.transaction(async (tx) => {
    const word = await tx.query.words.findFirst({ where: eq(words.id, input.wordId) });
    if (!word) {
      throw new AppError(404, "word_not_found", "That word is not in the deck.");
    }

    const existing = await tx.query.userWords.findFirst({
      where: and(eq(userWords.userId, user.id), eq(userWords.wordId, word.id))
    });

    const next = schedule(
      {
        ease: existing?.ease ?? 2.5,
        intervalDays: existing?.intervalDays ?? 0,
        reps: existing?.reps ?? 0,
        lapses: existing?.lapses ?? 0
      },
      input.quality
    );

    const now = new Date();

    const [saved] = await tx
      .insert(userWords)
      .values({
        userId: user.id,
        wordId: word.id,
        ease: next.ease,
        intervalDays: next.intervalDays,
        reps: next.reps,
        lapses: next.lapses,
        dueAt: next.dueAt,
        lastReviewedAt: now
      })
      .onConflictDoUpdate({
        target: [userWords.userId, userWords.wordId],
        set: {
          ease: next.ease,
          intervalDays: next.intervalDays,
          reps: next.reps,
          lapses: next.lapses,
          dueAt: next.dueAt,
          lastReviewedAt: now,
          updatedAt: now
        }
      })
      .returning();

    const profile = await awardXp(tx, user.id, next.xp, { cards: 1 });

    if (!saved) throw new AppError(500, "review_failed", "Could not save your review.");

    return { word, saved, profile, xp: next.xp };
  });

  const card = toCardDto({
    id: result.word.id,
    term: result.word.term,
    pos: result.word.pos,
    ipa: result.word.ipa,
    meaning: result.word.meaning,
    example: result.word.example,
    synonyms: result.word.synonyms,
    level: result.word.level,
    ease: result.saved.ease,
    intervalDays: result.saved.intervalDays,
    reps: result.saved.reps,
    lapses: result.saved.lapses,
    dueAt: result.saved.dueAt,
    lastReviewedAt: result.saved.lastReviewedAt
  });

  return c.json({
    card,
    xpGained: result.xp,
    totalXp: result.profile.xp,
    streak: result.profile.streak
  });
});
