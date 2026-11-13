import type { Context } from "hono";
import { z } from "zod";
import { AppError } from "./errors.js";

/**
 * Parse + validate a JSON body against a Zod schema, converting failures into
 * consistent 400/422 responses instead of throwing raw Zod errors.
 */
export async function parseJson<S extends z.ZodType>(
  c: Context,
  schema: S
): Promise<z.infer<S>> {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(422, "validation_error", "Some fields are invalid.", z.treeifyError(result.error));
  }

  return result.data;
}
