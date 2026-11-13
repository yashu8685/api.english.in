import { db } from "../db/index.js";
import { dailyActivity, profiles } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { AppError } from "./errors.js";

/** Transaction handle, derived from the db client so it stays in sync. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Shift a `YYYY-MM-DD` day key by a number of days, in UTC. */
function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return dayKey(date);
}

/**
 * Streak rules: studying twice in one day doesn't count twice, skipping a day
 * resets to 1. `today` is injectable so the rules can be tested without
 * depending on the wall clock.
 */
export function nextStreak(
  current: number,
  lastStudyOn: string | null,
  today: string = dayKey()
): number {
  if (lastStudyOn === today) return current;
  return lastStudyOn === shiftDay(today, -1) ? current + 1 : 1;
}

export async function bumpActivity(
  tx: Tx,
  userId: string,
  delta: { xp: number; cards?: number; lessons?: number }
): Promise<void> {
  const cards = delta.cards ?? 0;
  const lessons = delta.lessons ?? 0;

  await tx
    .insert(dailyActivity)
    .values({ userId, day: dayKey(), xp: delta.xp, cards, lessonsDone: lessons })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.day],
      set: {
        xp: sql`${dailyActivity.xp} + ${delta.xp}`,
        cards: sql`${dailyActivity.cards} + ${cards}`,
        lessonsDone: sql`${dailyActivity.lessonsDone} + ${lessons}`
      }
    });
}

/** Add XP, advance the streak, and record today's activity — atomically. */
export async function awardXp(
  tx: Tx,
  userId: string,
  xp: number,
  opts: { cards?: number; lessons?: number } = {}
) {
  let profile = await tx.query.profiles.findFirst({ where: eq(profiles.userId, userId) });

  // Defensive: a user created outside the normal sign-up flow (or before the
  // dashboard has loaded `/api/me`) still gets a profile rather than a 500.
  if (!profile) {
    const [created] = await tx
      .insert(profiles)
      .values({ userId })
      .onConflictDoNothing()
      .returning();
    profile =
      created ?? (await tx.query.profiles.findFirst({ where: eq(profiles.userId, userId) })) ?? null;
  }

  if (!profile) {
    throw new AppError(500, "profile_missing", "Your profile is missing. Sign out and back in.");
  }

  const streak = nextStreak(profile.streak, profile.lastStudyOn);

  const [updated] = await tx
    .update(profiles)
    .set({
      xp: sql`${profiles.xp} + ${xp}`,
      streak,
      lastStudyOn: dayKey(),
      updatedAt: new Date()
    })
    .where(eq(profiles.userId, userId))
    .returning();

  await bumpActivity(tx, userId, { xp, ...opts });

  if (!updated) throw new AppError(500, "profile_update_failed", "Could not update your profile.");
  return updated;
}
