import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../types.js";

/**
 * Errors we deliberately throw from route handlers. Anything else is treated
 * as a bug and reported as a 500 without leaking internals.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, requestId, details: err.details } },
      err.status
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "http_error", message: err.message, requestId } },
      err.status
    );
  }

  console.error(`[${requestId}] unhandled error:`, err);
  return c.json(
    { error: { code: "internal_error", message: "Something went wrong. Try again.", requestId } },
    500
  );
};
