import { loadEnv } from "./db/env.js";
import { z } from "zod";

// Load api/.env before reading anything from process.env.
loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(8787),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.url().default("http://localhost:8787"),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /** Speech-to-text model used for recorded attempts (Firefox/Safari). */
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),

  /* ── Optional: phoneme-level pronunciation assessment (Azure Speech) ── */
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),

  /* ── Optional: stored recordings ── */
  AUDIO_STORAGE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AUDIO_STORAGE_DIR: z.string().default("./.uploads")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("✗ Invalid environment configuration:\n");
  console.error(z.prettifyError(parsed.error));
  console.error("\n→ Copy .env.example to .env and fill in the missing values.");
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET.includes("replace-me")) {
  console.warn("⚠ BETTER_AUTH_SECRET still looks like the example value — rotate it before going live.");
}
