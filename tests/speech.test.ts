import { describe, expect, it } from "vitest";
import { scoreSpeech, tokenize, xpForSpeech } from "../src/lib/speech.js";

describe("tokenize", () => {
  it("ignores case, punctuation, apostrophes and dashes", () => {
    expect(tokenize("Don’t — stop well-known")).toEqual(["dont", "stop", "well", "known"]);
  });

  it("keeps digits", () => {
    expect(tokenize("In 2019, I left.")).toEqual(["in", "2019", "i", "left"]);
  });
});

describe("scoreSpeech", () => {
  it("gives 100 for an exact match, ignoring case and punctuation", () => {
    const result = scoreSpeech(
      "Could I have a glass of water, please?",
      "could i have a glass of water please"
    );

    expect(result.score).toBe(100);
    expect(result.words.every((word) => word.matched)).toBe(true);
  });

  it("treats apostrophes as optional", () => {
    const result = scoreSpeech(
      "I'm afraid I can't make it on Thursday.",
      "im afraid i cant make it on thursday"
    );

    expect(result.score).toBe(100);
  });

  it("flags the words that were missed", () => {
    const result = scoreSpeech(
      "She's got a lovely flat near the river.",
      "shes got a lovely flat near river"
    );

    expect(result.score).toBeLessThan(100);
    const missed = result.words.filter((word) => !word.matched).map((word) => word.word);
    expect(missed).toContain("the");
    expect(result.feedback).toContain("Focus on: the");
  });

  it("penalises rambling more than dropping a small word", () => {
    const tight = scoreSpeech("put the kettle on", "put kettle on");
    const rambling = scoreSpeech(
      "put the kettle on",
      "put the kettle on and then i made a cup of tea"
    );

    expect(tight.score).toBeGreaterThan(rambling.score);
  });

  it("returns zero for unrelated speech", () => {
    expect(scoreSpeech("put the kettle on", "completely different words").score).toBe(0);
  });

  it("keeps the display words aligned with the scored tokens", () => {
    const result = scoreSpeech("It's a bit chilly, put the kettle on.", "its a bit chilly put the kettle on");
    expect(result.words.map((word) => word.word)).toEqual([
      "It's",
      "a",
      "bit",
      "chilly",
      "put",
      "the",
      "kettle",
      "on"
    ]);
  });
});

describe("xpForSpeech", () => {
  it("rewards accuracy", () => {
    expect(xpForSpeech(100)).toBe(15);
    expect(xpForSpeech(80)).toBe(12);
    expect(xpForSpeech(60)).toBe(9);
    expect(xpForSpeech(10)).toBe(6);
  });
});

describe("dictation mode", () => {
  it("uses dictation-specific feedback", () => {
    const perfect = scoreSpeech("put the kettle on", "put the kettle on", "dictation");
    expect(perfect.score).toBe(100);
    expect(perfect.feedback).toContain("Perfect dictation");

    const missed = scoreSpeech("put the kettle on", "put kettle on", "dictation");
    expect(missed.feedback).toContain("Missed: the");
  });
});
