/**
 * Speech-to-text through any OpenAI-compatible `/audio/transcriptions`
 * endpoint. This is what makes microphone drills work in browsers without the
 * Web Speech API (Firefox, Safari).
 */
import { env } from "../env.js";
import { AppError } from "./errors.js";

export function transcriptionEnabled(): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

interface TranscriptionResponse {
  text?: unknown;
}

export async function transcribeAudio(input: {
  data: Buffer;
  mime: string;
  filename: string;
}): Promise<string> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      422,
      "transcript_required",
      "Type what you said, or add OPENAI_API_KEY to api/.env for automatic transcription."
    );
  }

  const baseUrl = env.OPENAI_BASE_URL.replace(/\/+$/, "");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.data)], { type: input.mime }), input.filename);
  form.append("model", env.OPENAI_TRANSCRIBE_MODEL);
  form.append("language", "en");
  form.append("response_format", "json");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    console.error("transcription request failed:", error);
    throw new AppError(
      502,
      "transcription_unavailable",
      "The transcription service could not be reached. Type what you said instead."
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`transcription upstream ${response.status}:`, detail.slice(0, 300));
    throw new AppError(
      502,
      "transcription_unavailable",
      "The transcription service could not understand that clip. Try again or type what you said."
    );
  }

  const payload = (await response.json()) as TranscriptionResponse;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (text === "") {
    throw new AppError(
      422,
      "no_speech",
      "That recording sounded silent. Move a little closer to the microphone and try again."
    );
  }

  return text;
}
