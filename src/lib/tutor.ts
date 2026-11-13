/**
 * Conversation tutor.
 *
 * With `OPENAI_API_KEY` set, replies come from any OpenAI-compatible chat
 * completions endpoint. Without a key the tutor falls back to a deterministic
 * local coach: it still runs a scenario, corrects common Americanisms and
 * replies with a British follow-up question, so the feature works out of the
 * box and the tests never touch the network.
 */
import { env } from "../env.js";
import type { TutorScenario } from "../../contracts.js";
import { AppError } from "./errors.js";

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TutorResult {
  reply: string;
  correction: string | null;
  provider: "openai" | "local";
}

interface Scenario {
  title: string;
  opener: string;
  prompts: string[];
}

export const TUTOR_SCENARIOS: Record<TutorScenario, Scenario> = {
  cafe: {
    title: "Ordering at a café",
    opener: "Hiya! What can I get you today?",
    prompts: [
      "Anything to eat with that? The scones are fresh.",
      "Is that eat in or takeaway?",
      "Anything else, love? We've got a lovely pot of tea."
    ]
  },
  interview: {
    title: "A job interview",
    opener: "Thanks for coming in. Tell me a little about yourself.",
    prompts: [
      "What attracted you to this role?",
      "Can you give me an example of a tricky problem you solved?",
      "Where do you see yourself in three years?"
    ]
  },
  "small-talk": {
    title: "Small talk",
    opener: "Alright? Bit chilly today, isn't it?",
    prompts: [
      "Any plans for the weekend?",
      "Did you catch the match last night?",
      "How's your week been so far?"
    ]
  },
  travel: {
    title: "Travelling",
    opener: "Good morning — where are you off to today?",
    prompts: [
      "Is it a return ticket or a single?",
      "Do you know which platform you need?",
      "Have you got much luggage?"
    ]
  },
  landlord: {
    title: "Renting a flat",
    opener: "Hello — you're ringing about the flat, aren't you?",
    prompts: [
      "When would you be looking to move in?",
      "Have you got any pets?",
      "Would you like to arrange a viewing this week?"
    ]
  }
};

interface UkRule {
  pattern: RegExp;
  uk: string;
  note: string;
}

/** Americanisms a B1–B2 learner is likely to use by accident. */
const UK_RULES: UkRule[] = [
  { pattern: /\bcolor\b/i, uk: "colour", note: "British spelling is 'colour'." },
  { pattern: /\bfavorite\b/i, uk: "favourite", note: "British spelling is 'favourite'." },
  { pattern: /\bapartment\b/i, uk: "flat", note: "In the UK, a home is a 'flat'." },
  { pattern: /\belevator\b/i, uk: "lift", note: "In the UK, it's a 'lift'." },
  { pattern: /\bsidewalk\b/i, uk: "pavement", note: "In the UK, it's the 'pavement'." },
  { pattern: /\bvacation\b/i, uk: "holiday", note: "In the UK, you go on 'holiday'." },
  { pattern: /\bcandy\b/i, uk: "sweets", note: "In the UK, it's 'sweets'." },
  { pattern: /\bfall\b/i, uk: "autumn", note: "The British season is 'autumn'." },
  { pattern: /\bgotten\b/i, uk: "got", note: "British English prefers 'got'." },
  { pattern: /\bmovie\b/i, uk: "film", note: "In the UK, it's usually a 'film'." }
];

interface GrammarRule {
  pattern: RegExp;
  replace: string;
  note: string;
}

const GRAMMAR_RULES: GrammarRule[] = [
  { pattern: /\bi am agree\b/i, replace: "I agree", note: "Say 'I agree', not 'I am agree'." },
  {
    pattern: /\bi have (\d+) years( old)?\b/i,
    replace: "I'm $1 years old",
    note: "Use 'I'm … years old'."
  },
  { pattern: /\bhe don't\b/i, replace: "he doesn't", note: "Third person: 'he doesn't'." },
  { pattern: /\bshe don't\b/i, replace: "she doesn't", note: "Third person: 'she doesn't'." },
  { pattern: /\bmore better\b/i, replace: "better", note: "'Better' is already comparative." }
];

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Apply the UK vocabulary and grammar rules to a learner turn. */
function applyRules(message: string): { corrected: string; notes: string[] } {
  const notes: string[] = [];
  let corrected = message;

  for (const rule of UK_RULES) {
    if (rule.pattern.test(corrected)) {
      corrected = corrected.replace(new RegExp(rule.pattern.source, "gi"), rule.uk);
      notes.push(rule.note);
    }
  }

  for (const rule of GRAMMAR_RULES) {
    if (rule.pattern.test(corrected)) {
      corrected = corrected.replace(new RegExp(rule.pattern.source, "gi"), rule.replace);
      notes.push(rule.note);
    }
  }

  return { corrected, notes };
}

/**
 * Deterministic correction shown under the conversation. Used with and without
 * an AI key, so streaming replies get the same coaching as chat completions.
 */
export function correctionFor(message: string): string | null {
  const { corrected, notes } = applyRules(message);
  if (corrected.trim() === message.trim()) return null;
  return `Try: “${capitalise(corrected)}”. ${notes.slice(0, 2).join(" ")}`;
}

/** Deterministic coaching reply used when no API key is configured. */
export function localTutorReply(
  scenario: TutorScenario,
  message: string,
  assistantTurns: number
): { reply: string; correction: string | null } {
  const prompts = TUTOR_SCENARIOS[scenario].prompts;
  const prompt = prompts[assistantTurns % prompts.length];
  const acknowledgement = /[?]\s*$/.test(message) ? "Good question." : "Nice one.";

  return {
    reply: `${acknowledgement} ${prompt}`,
    correction: correctionFor(message)
  };
}

function systemPrompt(scenario: TutorScenario): string {
  const { title } = TUTOR_SCENARIOS[scenario];
  return [
    `You are a warm, patient British English tutor helping a B1-B2 learner practise: ${title}.`,
    "Stay in the scenario, reply in 1-3 short sentences, and ask one natural follow-up question.",
    "Use British spelling and vocabulary (flat, holiday, lift, film, autumn) and natural UK phrasing.",
    "If the learner makes a clear mistake, put one short correction in the correction field; otherwise null.",
    'Reply with JSON only, shaped exactly like {"reply": "...", "correction": "..."} — correction may be null.'
  ].join(" ");
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function parseModelJson(content: string): { reply: string; correction: string | null } {
  const fallback = { reply: content.trim(), correction: null };

  try {
    const parsed = JSON.parse(content) as { reply?: unknown; correction?: unknown };
    if (typeof parsed.reply !== "string" || parsed.reply.trim() === "") return fallback;
    return {
      reply: parsed.reply.trim(),
      correction: typeof parsed.correction === "string" ? parsed.correction.trim() : null
    };
  } catch {
    return fallback;
  }
}

export async function tutorReply(input: {
  scenario: TutorScenario;
  history: TutorTurn[];
  message: string;
}): Promise<TutorResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const assistantTurns = input.history.filter((turn) => turn.role === "assistant").length;

  if (!apiKey) {
    return { ...localTutorReply(input.scenario, input.message, assistantTurns), provider: "local" };
  }

  const baseUrl = env.OPENAI_BASE_URL.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(input.scenario) },
          ...input.history.slice(-10),
          { role: "user", content: input.message }
        ]
      }),
      signal: AbortSignal.timeout(20_000)
    });
  } catch (error) {
    console.error("tutor request failed:", error);
    throw new AppError(502, "tutor_unavailable", "The AI tutor could not answer. Try again.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`tutor upstream ${response.status}:`, detail.slice(0, 300));
    throw new AppError(502, "tutor_unavailable", "The AI tutor could not answer. Try again.");
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content ?? "";

  if (content.trim() === "") {
    throw new AppError(502, "tutor_unavailable", "The AI tutor sent an empty reply.");
  }

  return { ...parseModelJson(content), provider: "openai" };
}

/* ─────────────────────────── streaming replies ─────────────────────────── */

function streamingSystemPrompt(scenario: TutorScenario): string {
  const { title } = TUTOR_SCENARIOS[scenario];
  return [
    `You are a warm, patient British English tutor helping a B1-B2 learner practise: ${title}.`,
    "Stay in the scenario, reply in 1-3 short sentences, and ask one natural follow-up question.",
    "Use British spelling and vocabulary (flat, holiday, lift, film, autumn) and natural UK phrasing.",
    "Reply with plain conversational text only — no JSON, no headings, no bullet points."
  ].join(" ");
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StreamingChoice {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Stream a tutor reply chunk by chunk.
 *
 * With a key, this follows the upstream `/chat/completions` stream. If the
 * upstream is unreachable before the first token, it falls back to the local
 * coach rather than failing the turn. Corrections stay deterministic (the UK
 * and grammar rules), so they are available the moment the turn starts instead
 * of being embedded in the model output.
 */
export async function streamTutorReply(
  input: {
    scenario: TutorScenario;
    history: TutorTurn[];
    message: string;
  },
  onDelta: (text: string) => Promise<void>
): Promise<TutorResult> {
  const assistantTurns = input.history.filter((turn) => turn.role === "assistant").length;
  const apiKey = env.OPENAI_API_KEY?.trim();

  const streamLocal = async (): Promise<TutorResult> => {
    const local = localTutorReply(input.scenario, input.message, assistantTurns);
    const chunks = local.reply.match(/\S+\s*/g) ?? [local.reply];
    const delay = env.NODE_ENV === "test" ? 0 : 18;

    for (const chunk of chunks) {
      await onDelta(chunk);
      if (delay > 0) await pause(delay);
    }

    return { ...local, provider: "local" };
  };

  if (!apiKey) return await streamLocal();

  const baseUrl = env.OPENAI_BASE_URL.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.7,
        stream: true,
        messages: [
          { role: "system", content: streamingSystemPrompt(input.scenario) },
          ...input.history.slice(-10),
          { role: "user", content: input.message }
        ]
      }),
      signal: AbortSignal.timeout(60_000)
    });
  } catch (error) {
    console.error("tutor stream request failed, using local coach:", error);
    return await streamLocal();
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error(`tutor stream upstream ${response.status}:`, detail.slice(0, 300));
    return await streamLocal();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let emitted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "" || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload) as StreamingChoice;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta !== "") {
            reply += delta;
            emitted = true;
            await onDelta(delta);
          }
        } catch {
          // Ignore keep-alives and malformed frames; the stream continues.
        }
      }
    }
  } catch (error) {
    if (!emitted) {
      console.error("tutor stream dropped before the first token, using local coach:", error);
      return await streamLocal();
    }
    throw new AppError(502, "tutor_unavailable", "The AI tutor stopped mid-reply. Try again.");
  }

  if (reply.trim() === "") {
    return await streamLocal();
  }

  return {
    reply: reply.trim(),
    correction: correctionFor(input.message),
    provider: "openai"
  };
}
