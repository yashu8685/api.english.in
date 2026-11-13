import { db } from "../db/index.js";
import { profiles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Profile } from "../db/index.js";

/**
 * Every authenticated user gets a profile row lazily, on their first request.
 * `onConflictDoNothing` + re-select makes this safe under concurrent requests.
 */
export async function ensureProfile(userId: string, name: string): Promise<Profile> {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId)
  });
  if (existing) return existing;

  const inserted = await db
    .insert(profiles)
    .values({ userId, displayName: name })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const raced = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId)
  });
  if (!raced) throw new Error(`Profile for ${userId} could not be created`);
  return raced;
}

/** Map a DB row to the public profile shape (dates → ISO strings). */
export function toProfileDto(profile: Profile) {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    level: profile.level as "A2" | "B1" | "B2" | "C1",
    dailyGoal: profile.dailyGoal,
    xp: profile.xp,
    streak: profile.streak,
    lastStudyOn: profile.lastStudyOn ?? null
  };
}
