import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { dayKey, nextStreak } from "../src/lib/activity.js";

afterAll(async () => {
  await pool.end();
});

describe("dayKey", () => {
  it("formats the UTC calendar day", () => {
    expect(dayKey(new Date("2026-05-10T00:00:00.000Z"))).toBe("2026-05-10");
    expect(dayKey(new Date("2026-05-10T23:59:59.999Z"))).toBe("2026-05-10");
  });
});

describe("nextStreak", () => {
  const today = "2026-05-10";

  it("counts the first study day as a one-day streak", () => {
    expect(nextStreak(0, null, today)).toBe(1);
  });

  it("does not count a second session on the same day", () => {
    expect(nextStreak(4, today, today)).toBe(4);
  });

  it("extends a streak when the last session was yesterday", () => {
    expect(nextStreak(4, "2026-05-09", today)).toBe(5);
    expect(nextStreak(1, "2026-04-30", "2026-05-01")).toBe(2);
  });

  it("continues across month and year boundaries", () => {
    expect(nextStreak(9, "2026-04-30", "2026-05-01")).toBe(10);
    expect(nextStreak(2, "2025-12-31", "2026-01-01")).toBe(3);
    expect(nextStreak(2, "2028-02-29", "2028-03-01")).toBe(3);
  });

  it("resets to one after a skipped day", () => {
    expect(nextStreak(12, "2026-05-08", today)).toBe(1);
    expect(nextStreak(12, "2025-01-01", today)).toBe(1);
  });
});
