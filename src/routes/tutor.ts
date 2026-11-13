import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tutorConversations, tutorMessages } from "../db/schema.js";
import {
  tutorChatSchema,
  tutorScenarioSchema,
  type TutorScenario
} from "../../contracts.js";
import type { AppEnv } from "../types.js";
import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import {
  streamTutorReply,
  tutorReply,
  TUTOR_SCENARIOS,
  type TutorTurn
} from "../lib/tutor.js";
import { parseJson } from "../lib/validation.js";

export const tutorRoutes = new Hono<AppEnv>();

function scenarioFrom(value: string | undefined): TutorScenario {
  const parsed = tutorScenarioSchema.safeParse(value ?? "cafe");
  if (!parsed.success) {
    throw new AppError(422, "validation_error", "Unknown conversation scenario.");
  }
  return parsed.data;
}

async function findConversation(userId: string, scenario: TutorScenario) {
  return await db.query.tutorConversations.findFirst({
    where: and(eq(tutorConversations.userId, userId), eq(tutorConversations.scenario, scenario))
  });
}

/** One conversation per user per scenario, created on first use. */
async function ensureConversation(userId: string, scenario: TutorScenario) {
  const existing = await findConversation(userId, scenario);
  if (existing) return existing;

  const [created] = await db
    .insert(tutorConversations)
    .values({ userId, scenario })
    .onConflictDoUpdate({
      target: [tutorConversations.userId, tutorConversations.scenario],
      set: { updatedAt: new Date() }
    })
    .returning();

  if (!created) throw new AppError(500, "tutor_failed", "Could not start the conversation.");
  return created;
}

async function recentHistory(conversationId: string): Promise<TutorTurn[]> {
  const recent = await db
    .select({ role: tutorMessages.role, content: tutorMessages.content })
    .from(tutorMessages)
    .where(eq(tutorMessages.conversationId, conversationId))
    .orderBy(desc(tutorMessages.createdAt))
    .limit(10);

  return recent
    .reverse()
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content
    }));
}

async function persistTurn(input: {
  conversationId: string;
  message: string;
  reply: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(tutorMessages).values([
      { conversationId: input.conversationId, role: "user", content: input.message },
      { conversationId: input.conversationId, role: "assistant", content: input.reply }
    ]);
    await tx
      .update(tutorConversations)
      .set({ updatedAt: new Date() })
      .where(eq(tutorConversations.id, input.conversationId));
  });
}

tutorRoutes.get("/tutor/history", async (c) => {
  const user = c.get("user");
  const scenario = scenarioFrom(c.req.query("scenario"));
  const opener = TUTOR_SCENARIOS[scenario].opener;

  const conversation = await findConversation(user.id, scenario);
  if (!conversation) return c.json({ scenario, opener, messages: [] });

  const messages = await db
    .select()
    .from(tutorMessages)
    .where(eq(tutorMessages.conversationId, conversation.id))
    .orderBy(asc(tutorMessages.createdAt));

  return c.json({
    scenario,
    opener,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: message.content,
      createdAt: message.createdAt.toISOString()
    }))
  });
});

tutorRoutes.post("/tutor/chat", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c, tutorChatSchema);

  const conversation = await ensureConversation(user.id, input.scenario);
  const history = await recentHistory(conversation.id);

  const result = await tutorReply({
    scenario: input.scenario,
    history,
    message: input.message
  });

  await persistTurn({
    conversationId: conversation.id,
    message: input.message,
    reply: result.reply
  });

  return c.json({
    conversationId: conversation.id,
    reply: result.reply,
    correction: result.correction,
    provider: result.provider
  });
});

/**
 * Server-sent events: `meta` → `delta`* → `done`.
 *
 * The reply streams token by token from the configured model, or word by word
 * from the local coach. The turn is persisted before `done`, so the client can
 * invalidate its history query and render the stored messages.
 */
tutorRoutes.post("/tutor/chat/stream", async (c) => {
  const user = c.get("user");
  const input = await parseJson(c, tutorChatSchema);

  const conversation = await ensureConversation(user.id, input.scenario);
  const history = await recentHistory(conversation.id);
  const configured = env.OPENAI_API_KEY?.trim() ? "openai" : "local";

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "meta",
      data: JSON.stringify({
        type: "meta",
        conversationId: conversation.id,
        provider: configured
      })
    });

    try {
      const result = await streamTutorReply(
        { scenario: input.scenario, history, message: input.message },
        async (text) => {
          await stream.writeSSE({
            event: "delta",
            data: JSON.stringify({ type: "delta", text })
          });
        }
      );

      // The upstream may have been unavailable and fallen back to local.
      if (result.provider !== configured) {
        await stream.writeSSE({
          event: "meta",
          data: JSON.stringify({
            type: "meta",
            conversationId: conversation.id,
            provider: result.provider
          })
        });
      }

      await persistTurn({
        conversationId: conversation.id,
        message: input.message,
        reply: result.reply
      });

      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({
          type: "done",
          reply: result.reply,
          correction: result.correction
        })
      });
    } catch (error) {
      console.error("tutor stream failed:", error);
      const message =
        error instanceof AppError ? error.message : "The tutor could not reply. Try again.";
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ type: "error", message })
      });
    }
  });
});

tutorRoutes.delete("/tutor/history", async (c) => {
  const user = c.get("user");
  const scenario = scenarioFrom(c.req.query("scenario"));

  await db
    .delete(tutorConversations)
    .where(
      and(eq(tutorConversations.userId, user.id), eq(tutorConversations.scenario, scenario))
    );

  return c.json({ ok: true });
});
