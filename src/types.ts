import type { auth } from "./lib/auth.js";

/** Hono context typing shared by every route. */
export type AppEnv = {
  Variables: {
    requestId: string;
    user: typeof auth.$Infer.Session.user;
    session: typeof auth.$Infer.Session.session;
  };
};
