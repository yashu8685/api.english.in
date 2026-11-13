import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env.js";
import { auth } from "./lib/auth.js";
import { errorHandler } from "./lib/errors.js";
import { authRateLimit } from "./middleware/rate-limit.js";
import { requireAuth } from "./middleware/session.js";
import { lessonRoutes } from "./routes/lessons.js";
import { listeningRoutes } from "./routes/listening.js";
import { meRoutes } from "./routes/me.js";
import { speakingRoutes } from "./routes/speaking.js";
import { tutorRoutes } from "./routes/tutor.js";
import { vocabularyRoutes } from "./routes/vocabulary.js";
import type { AppEnv } from "./types.js";

export const app = new Hono<AppEnv>();

/* ─────────────────────────── global middleware ─────────────────────────── */

app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
const smallBodyLimit = bodyLimit({
  maxSize: 128 * 1024,
  onError: (c) =>
    c.json({ error: { code: "payload_too_large", message: "Request body is too large." } }, 413)
});

/** Recorded attempts are multipart and need room for a few minutes of audio. */
const audioBodyLimit = bodyLimit({
  maxSize: 12 * 1024 * 1024,
  onError: (c) =>
    c.json({ error: { code: "payload_too_large", message: "That recording is too large." } }, 413)
});

app.use("*", (c, next) =>
  c.req.path === "/api/speaking/attempt" ? audioBodyLimit(c, next) : smallBodyLimit(c, next)
);

app.use(
  "/api/*",
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600
  })
);

/* ─────────────────────────────── health ────────────────────────────────── */

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "fluent-api",
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime())
  })
);

/* ──────────────────────────── auth (public) ────────────────────────────── */

// Better Auth handles sign-up, sign-in, sign-out, session and password reset.
app.use("/api/auth/*", authRateLimit);
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

/* ─────────────────────── application (protected) ───────────────────────── */

const api = new Hono<AppEnv>();
api.use("*", requireAuth);
api.route("/", meRoutes);
api.route("/", vocabularyRoutes);
api.route("/", lessonRoutes);
api.route("/", speakingRoutes);
api.route("/", listeningRoutes);
api.route("/", tutorRoutes);

app.route("/api", api);

/* ─────────────────────────────── fallbacks ─────────────────────────────── */

app.notFound((c) =>
  c.json(
    { error: { code: "not_found", message: `No route for ${c.req.method} ${c.req.path}` } },
    404
  )
);

app.onError(errorHandler);

export type AppType = typeof app;
