/**
 * Optional server-side storage for speaking recordings.
 *
 * Audio is uploaded for scoring either way; this module only handles the
 * opt-in "keep my recording" path. Files live outside the web root in
 * `AUDIO_STORAGE_DIR` and are served through an authenticated route, never
 * statically. Delete the attempt row and the file goes with it.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { env } from "../env.js";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3"
};

const EXTENSION_MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg"
};

/** MediaRecorder sometimes reports `audio/webm;codecs=opus`. */
export function normaliseAudioMime(value: string | undefined | null): string | null {
  if (!value) return null;
  const base = value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/x-wav" || base === "audio/wave") return "audio/wav";
  return base in MIME_EXTENSIONS ? base : null;
}

export function audioStorageEnabled(): boolean {
  return env.AUDIO_STORAGE_ENABLED;
}

function root(): string {
  return resolve(process.cwd(), env.AUDIO_STORAGE_DIR);
}

export interface StoredAudio {
  /** Relative file name; store this in Postgres, not an absolute path. */
  path: string;
  mime: string;
}

export async function saveAudio(data: Buffer, mime: string): Promise<StoredAudio> {
  const extension = MIME_EXTENSIONS[mime] ?? ".bin";
  const name = `${randomUUID()}${extension}`;
  const directory = root();

  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, name), data, { mode: 0o600 });

  return { path: name, mime };
}

/** Reject traversal and unknown extensions before touching the filesystem. */
function safeName(name: string): string | null {
  const base = basename(name);
  if (base !== name) return null;
  const extension = base.slice(base.lastIndexOf("."));
  return extension in EXTENSION_MIME ? base : null;
}

export async function readAudio(
  name: string
): Promise<{ data: Buffer; mime: string } | null> {
  const safe = safeName(name);
  if (!safe) return null;

  try {
    const data = await readFile(resolve(root(), safe));
    return { data, mime: EXTENSION_MIME[safe.slice(safe.lastIndexOf("."))] ?? "audio/wav" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteAudio(name: string | null | undefined): Promise<void> {
  if (!name) return;
  const safe = safeName(name);
  if (!safe) return;

  await unlink(resolve(root(), safe)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
