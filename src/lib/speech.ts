/**
 * Server-side pronunciation scoring.
 *
 * Speech recognition runs in the browser (Web Speech API, en-GB). The browser
 * sends the final transcript and the API scores it against the target phrase
 * here, so XP and best scores cannot be forged by editing the client.
 *
 * The comparison is deliberately forgiving:
 * - case, punctuation and apostrophes are ignored (`can't` === `cant`),
 * - words may be inserted or dropped (LCS alignment),
 * - extra rambling is penalised a little so a shotgun of words isn't free.
 */

export interface SpeakingWord {
  word: string;
  matched: boolean;
}

export interface SpeechScore {
  score: number;
  words: SpeakingWord[];
  feedback: string;
}

const APOSTROPHES = /[\u2018\u2019\u02bc`]/g;

/** Normalise to comparable tokens, keeping the original word for display. */
export function tokenize(input: string): string[] {
  return input
    .normalize("NFKC")
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    // Hyphens join words in writing but are two words when spoken.
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Longest-common-subsequence alignment; returns which target words matched. */
function matchWords(target: string[], said: string[]): boolean[] {
  const n = target.length;
  const m = said.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        target[i] === said[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matched = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (target[i] === said[j]) {
      matched[i] = true;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return matched;
}

function feedbackFor(score: number, missing: string[]): string {
  let feedback: string;

  if (score >= 95) {
    feedback = "Spot on — that sounded natural. Keep the same rhythm at full speed.";
  } else if (score >= 80) {
    feedback = "Good. A couple of words slipped; repeat them once, then say the whole phrase again.";
  } else if (score >= 60) {
    feedback = "Nearly there. Slow down and shape the stressed words before speeding up.";
  } else if (score >= 30) {
    feedback = "Keep going — listen to the model once more, then repeat it word by word.";
  } else {
    feedback = "Try the slow version first, then say the phrase in one breath.";
  }

  if (score < 95 && missing.length > 0) {
    feedback += ` Focus on: ${missing.slice(0, 3).join(", ")}.`;
  }

  return feedback;
}

/** Split the phrase into display words whose count matches `tokenize()`. */
function displayWords(target: string): string[] {
  return target
    .replace(/[-–—]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""))
    .filter(Boolean);
}

function dictationFeedback(score: number, missing: string[]): string {
  let feedback: string;

  if (score >= 95) {
    feedback = "Perfect dictation — every word matched.";
  } else if (score >= 80) {
    feedback = "Close. Replay once and check the words highlighted in red.";
  } else if (score >= 60) {
    feedback = "Good effort. Play the slow version and type it in chunks.";
  } else if (score >= 30) {
    feedback = "Keep listening — the slow version and a pause after each phrase will help.";
  } else {
    feedback = "Play the slow version, pause after each phrase, and build the sentence up.";
  }

  if (score < 95 && missing.length > 0) {
    feedback += ` Missed: ${missing.slice(0, 3).join(", ")}.`;
  }

  return feedback;
}

/** Score a transcript (0–100) against a target phrase. */
export function scoreSpeech(
  target: string,
  transcript: string,
  mode: "speaking" | "dictation" = "speaking"
): SpeechScore {
  const targetTokens = tokenize(target);
  const saidTokens = tokenize(transcript);

  if (targetTokens.length === 0) {
    return { score: 0, words: [], feedback: "This phrase has no words to score." };
  }

  const matched = matchWords(targetTokens, saidTokens);
  const matchedCount = matched.filter(Boolean).length;
  const extras = Math.max(0, saidTokens.length - matchedCount);

  const accuracy = matchedCount / targetTokens.length;
  // Extra words cost a little (max 35 points). Without this, adding a stream
  // of accurate words around a short phrase could out-score saying it exactly.
  const penalty = Math.min(0.35, extras * 0.04);
  const score = Math.round(Math.max(0, Math.min(1, accuracy - penalty)) * 100);

  // `displayWords` should line up with the scored tokens; if a phrase has an
  // unusual character, fall back to the normalised tokens so feedback stays
  // aligned rather than silently shifting every word.
  const display =
    displayWords(target).length === targetTokens.length ? displayWords(target) : targetTokens;

  const words: SpeakingWord[] = display.map((word, index) => ({
    word,
    matched: matched[index] ?? false
  }));

  const missing = words.filter((word) => !word.matched).map((word) => word.word);
  const feedback =
    mode === "dictation" ? dictationFeedback(score, missing) : feedbackFor(score, missing);

  return { score, words, feedback };
}

/**
 * XP for a spoken attempt. Full value on the first attempt at a phrase each
 * day; later attempts still count as practice (see the route) but earn less.
 */
export function xpForSpeech(score: number): number {
  if (score >= 95) return 15;
  if (score >= 80) return 12;
  if (score >= 60) return 9;
  return 6;
}
