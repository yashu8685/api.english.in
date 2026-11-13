import type { ReviewQuality } from "../../contracts.js";

export interface SrsState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface SrsResult extends SrsState {
  dueAt: Date;
  xp: number;
}

const DAY_MS = 86_400_000;

export const XP_FOR_QUALITY: Record<ReviewQuality, number> = {
  again: 2,
  hard: 6,
  good: 10,
  easy: 12
};

/**
 * SM-2 flavoured scheduling. Mirrors what the client used to do locally, but
 * now runs on the server so every device sees the same schedule.
 */
export function schedule(
  state: SrsState,
  quality: ReviewQuality,
  now: Date = new Date()
): SrsResult {
  let { ease, intervalDays, reps, lapses } = state;
  let dueAt: Date;

  if (quality === "again") {
    reps = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    intervalDays = 0;
    dueAt = new Date(now.getTime() + 10 * 60_000); // see it again in 10 minutes
  } else {
    reps += 1;

    if (quality === "hard") {
      ease = Math.max(1.3, ease - 0.15);
      intervalDays = reps === 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    } else if (quality === "good") {
      intervalDays = reps === 1 ? 2 : reps === 2 ? 5 : Math.max(1, Math.round(intervalDays * ease));
    } else {
      ease = Math.min(3.2, ease + 0.1);
      intervalDays =
        reps === 1 ? 3 : reps === 2 ? 7 : Math.max(1, Math.round(intervalDays * ease * 1.25));
    }

    dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
  }

  return {
    ease: Number(ease.toFixed(2)),
    intervalDays,
    reps,
    lapses,
    dueAt,
    xp: XP_FOR_QUALITY[quality]
  };
}

/** A card is "mature" once it has survived a week or more. */
export function isMature(intervalDays: number, reps: number): boolean {
  return reps >= 3 && intervalDays >= 7;
}
