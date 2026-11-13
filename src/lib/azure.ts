/**
 * Phoneme-level pronunciation assessment through Azure Speech.
 *
 * Azure returns a score per word *and* per phoneme, plus fluency and
 * completeness. It is optional: without `AZURE_SPEECH_KEY` /
 * `AZURE_SPEECH_REGION` the API falls back to word-accuracy scoring, and a
 * failed Azure call never fails the attempt.
 *
 * The browser converts the recording to 16 kHz mono PCM WAV before upload,
 * which is the format the short-audio REST endpoint expects.
 */
import { env } from "../env.js";
import type { PronunciationWord, SpeechAssessment } from "../../contracts.js";

export function phonemeAssessmentEnabled(): boolean {
  return Boolean(env.AZURE_SPEECH_KEY?.trim() && env.AZURE_SPEECH_REGION?.trim());
}

interface AzureWord {
  Word?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
}

interface AzureNBest {
  DisplayText?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    FluencyScore?: number;
    CompletenessScore?: number;
    PronScore?: number;
  };
  Words?: AzureWord[];
}

interface AzureResponse {
  RecognitionStatus?: string;
  NBest?: AzureNBest[];
}

function round(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function contentLabel(mime: string): string {
  if (mime === "audio/wav") return "audio/wav; codecs=audio/pcm; samplerate=16000";
  return mime;
}

/** Returns null when Azure is unavailable or does not recognise speech. */
export async function assessPronunciation(input: {
  data: Buffer;
  mime: string;
  referenceText: string;
}): Promise<{ assessment: SpeechAssessment; displayText: string } | null> {
  const key = env.AZURE_SPEECH_KEY?.trim();
  const region = env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) return null;

  const configuration = Buffer.from(
    JSON.stringify({
      ReferenceText: input.referenceText,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      EnableMiscue: true
    }),
    "utf8"
  ).toString("base64");

  const endpoint =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    "?language=en-GB";

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": contentLabel(input.mime),
        "Pronunciation-Assessment": configuration,
        Accept: "application/json"
      },
      body: new Uint8Array(input.data),
      signal: AbortSignal.timeout(25_000)
    });
  } catch (error) {
    console.error("azure pronunciation request failed:", error);
    return null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`azure pronunciation ${response.status}:`, detail.slice(0, 300));
    return null;
  }

  let payload: AzureResponse;
  try {
    payload = (await response.json()) as AzureResponse;
  } catch {
    return null;
  }

  const best = payload.NBest?.[0];
  if (!best || payload.RecognitionStatus === "NoMatch" || !best.PronunciationAssessment) {
    return null;
  }

  const phonemes: PronunciationWord[] = (best.Words ?? []).map((word) => {
    const errorType = word.PronunciationAssessment?.ErrorType;
    return {
      word: word.Word ?? "",
      accuracy: round(word.PronunciationAssessment?.AccuracyScore),
      errorType: errorType && errorType !== "None" ? errorType : null
    };
  });

  return {
    assessment: {
      provider: "azure",
      accuracy: round(best.PronunciationAssessment.AccuracyScore),
      fluency: round(best.PronunciationAssessment.FluencyScore),
      completeness: round(best.PronunciationAssessment.CompletenessScore),
      pronunciation: round(best.PronunciationAssessment.PronScore),
      phonemes
    },
    displayText: (best.DisplayText ?? "").trim()
  };
}

/** Assessment object used when no phoneme provider is configured. */
export function wordAccuracyAssessment(): SpeechAssessment {
  return {
    provider: "word-accuracy",
    accuracy: null,
    fluency: null,
    completeness: null,
    pronunciation: null,
    phonemes: []
  };
}
