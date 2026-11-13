import type { MiddlewareHandler } from "hono";
import { auth } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

/**
 * Reads the Better Auth session from the request cookie and puts the user on
 * the context. Any route mounted behind this middleware is authenticated.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    throw new AppError(401, "unauthorized", "You need to sign in to do that.");
  }

  c.set("user", session.user);
  c.set("session", session.session);

  await next();
};
