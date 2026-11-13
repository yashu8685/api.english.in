import { describe, expect, it } from "vitest";
import { isMature, schedule, XP_FOR_QUALITY } from "../src/lib/srs.js";
import type { SrsState } from "../src/lib/srs.js";

const NOW = new Date("2026-05-10T09:00:00.000Z");
const DAY_MS = 86_400_000;

function state(overrides: Partial<SrsState> = {}): SrsState {
  return { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, ...overrides };
}

describe("schedule", () => {
  it("resets reps and brings an 'again' card back in ten minutes", () => {
    const result = schedule(state({ ease: 2.6, reps: 4, intervalDays: 30, lapses: 2 }), "again", NOW);

    expect(result).toMatchObject({
      reps: 0,
      intervalDays: 0,
      lapses: 3,
      ease: 2.4,
      xp: 2
    });
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 10 * 60_000);
  });

  it("never drops ease below 1.3 on 'again'", () => {
    const result = schedule(state({ ease: 1.35 }), "again", NOW);
    expect(result.ease).toBe(1.3);
  });

  it("schedules the first 'hard' review for one day and lowers ease", () => {
    const result = schedule(state(), "hard", NOW);

    expect(result.reps).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.ease).toBe(2.35);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(result.xp).toBe(6);
  });

  it("grows a hard interval slowly and keeps it at one day minimum", () => {
    const second = schedule(state({ reps: 1, intervalDays: 1, ease: 2.35 }), "hard", NOW);
    expect(second.reps).toBe(2);
    expect(second.intervalDays).toBe(1);
    expect(second.ease).toBe(2.2);
  });

  it("follows the 2 → 5 → interval × ease ladder for 'good'", () => {
    const first = schedule(state(), "good", NOW);
    expect(first).toMatchObject({ reps: 1, intervalDays: 2, ease: 2.5, xp: 10 });

    const second = schedule(state({ reps: 1, intervalDays: 2 }), "good", NOW);
    expect(second).toMatchObject({ reps: 2, intervalDays: 5, ease: 2.5 });

    const third = schedule(state({ reps: 2, intervalDays: 5 }), "good", NOW);
    expect(third).toMatchObject({ reps: 3, intervalDays: 13, ease: 2.5 });
  });

  it("follows the 3 → 7 → interval × ease × 1.25 ladder for 'easy'", () => {
    const first = schedule(state(), "easy", NOW);
    expect(first).toMatchObject({ reps: 1, intervalDays: 3, ease: 2.6, xp: 12 });

    const second = schedule(state({ reps: 1, intervalDays: 3, ease: 2.6 }), "easy", NOW);
    expect(second.intervalDays).toBe(7);

    const third = schedule(state({ reps: 2, intervalDays: 7, ease: 2.5 }), "easy", NOW);
    expect(third.intervalDays).toBe(23);
    expect(third.ease).toBe(2.6);
  });

  it("caps ease at 3.2", () => {
    const result = schedule(state({ ease: 3.15 }), "easy", NOW);
    expect(result.ease).toBe(3.2);
  });

  it("returns whole-day due dates anchored to the supplied clock", () => {
    const good = schedule(state(), "good", NOW);
    const easy = schedule(state(), "easy", NOW);

    expect(good.dueAt.toISOString()).toBe("2026-05-12T09:00:00.000Z");
    expect(easy.dueAt.toISOString()).toBe("2026-05-13T09:00:00.000Z");
  });

  it("pays the documented XP for each rating", () => {
    expect(XP_FOR_QUALITY).toEqual({ again: 2, hard: 6, good: 10, easy: 12 });
  });
});

describe("isMature", () => {
  it("requires at least three reps and a week-long interval", () => {
    expect(isMature(7, 3)).toBe(true);
    expect(isMature(6, 3)).toBe(false);
    expect(isMature(7, 2)).toBe(false);
    expect(isMature(30, 6)).toBe(true);
  });
});
