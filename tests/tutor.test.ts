import { describe, expect, it } from "vitest";
import { correctionFor, localTutorReply, streamTutorReply, TUTOR_SCENARIOS } from "../src/lib/tutor.js";

describe("localTutorReply", () => {
  it("corrects British vocabulary without an API key", () => {
    const result = localTutorReply(
      "cafe",
      "I would like a color coffee in an apartment",
      0
    );

    expect(result.correction).toContain("colour");
    expect(result.correction).toContain("flat");
    expect(result.reply).toBeTruthy();
  });

  it("corrects common grammar slips", () => {
    const result = localTutorReply("small-talk", "I am agree, he don't like it", 1);
    expect(result.correction).toContain("I agree");
    expect(result.correction).toContain("he doesn't");
  });

  it("leaves correct British English alone and asks a follow-up", () => {
    const result = localTutorReply("travel", "Could I have a return ticket, please?", 0);
    expect(result.correction).toBeNull();
    expect(result.reply).toContain(TUTOR_SCENARIOS.travel.prompts[0]);
  });

  it("cycles through scenario prompts", () => {
    const first = localTutorReply("cafe", "Hello", 0);
    const second = localTutorReply("cafe", "Hello", 1);
    expect(first.reply).not.toBe(second.reply);
  });
});

describe("correctionFor", () => {
  it("returns null for clean British English", () => {
    expect(correctionFor("I've just moved into a flat in Bristol.")).toBeNull();
  });

  it("returns one combined correction for several slips", () => {
    const correction = correctionFor("My favorite color is blue");
    expect(correction).toContain("favourite colour");
    expect(correction).toContain("Try:");
  });
});

describe("streamTutorReply", () => {
  it("streams the local reply in multiple chunks", async () => {
    const chunks: string[] = [];
    const result = await streamTutorReply(
      { scenario: "cafe", history: [], message: "Hello" },
      async (text) => {
        chunks.push(text);
      }
    );

    expect(result.provider).toBe("local");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(result.reply);
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("streams corrections alongside the reply", async () => {
    const chunks: string[] = [];
    const result = await streamTutorReply(
      { scenario: "small-talk", history: [], message: "I am agree about the elevator" },
      async (text) => {
        chunks.push(text);
      }
    );

    expect(result.correction).toContain("I agree");
    expect(result.correction).toContain("lift");
    expect(chunks.join("")).toBe(result.reply);
  });
});
