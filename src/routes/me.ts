import { Hono } from "hono";
import { db } from "../db/index.js";
import { dailyActivity, lessonAttempts, lessons, profiles, userWords, words } from "../db/schema.js";
import { updateProfileSchema } from "../../contracts.js";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types.js";
import { dayKey } from "../lib/activity.js";
import { AppError } from "../lib/errors.js";
import { ensureProfile, toProfileDto } from "../lib/profile.js";
import { parseJson } from "../lib/validation.js";

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const profile = await ensureProfile(user.id, user.name);

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null
    },
    profile: toProfileDto(profile)
  });
});

meRoutes.patch("/me", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c, updateProfileSchema);

  await ensureProfile(user.id, user.name);

  const [updated] = await db
    .update(profiles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id))
    .returning();

  if (!updated) throw new AppError(404, "profile_missing", "Profile not found.");

  return c.json({ profile: toProfileDto(updated) });
});

meRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const profile = await ensureProfile(user.id, user.name);
  const now = new Date();

  const [wordStats] = await db
    .select({
      started: sql<number>`count(*)::int`,
      due: sql<number>`count(*) filter (where ${userWords.dueAt} <= ${now})::int`,
      mature: sql<number>`count(*) filter (where ${userWords.reps} >= 3 and ${userWords.intervalDays} >= 7)::int`
    })
    .from(userWords)
    .where(eq(userWords.userId, user.id));

  const [deck] = await db.select({ total: sql<number>`count(*)::int` }).from(words);
  const [lessonTotals] = await db.select({ total: sql<number>`count(*)::int` }).from(lessons);
  const [attempts] = await db
    .select({ completed: sql<number>`count(distinct ${lessonAttempts.lessonId})::int` })
    .from(lessonAttempts)
    .where(eq(lessonAttempts.userId, user.id));

  const [today] = await db
    .select({ cards: dailyActivity.cards })
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, user.id), eq(dailyActivity.day, dayKey())));

  const started = wordStats?.started ?? 0;
  const deckSize = deck?.total ?? 0;

  return c.json({
    xp: profile.xp,
    streak: profile.streak,
    dailyGoal: profile.dailyGoal,
    cardsToday: today?.cards ?? 0,
    dueCount: wordStats?.due ?? 0,
    newCount: Math.max(0, deckSize - started),
    matureCount: wordStats?.mature ?? 0,
    totalWords: deckSize,
    lessonsCompleted: attempts?.completed ?? 0,
    totalLessons: lessonTotals?.total ?? 0
  });
});
