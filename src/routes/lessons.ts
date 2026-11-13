import { Hono } from "hono";
import { db } from "../db/index.js";
import { lessonAttempts, lessons } from "../db/schema.js";
import {
  lessonAttemptSchema,
  lessonContentSchema,
  type Level,
  type LessonContent
} from "../../contracts.js";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types.js";
import { awardXp } from "../lib/activity.js";
import { AppError } from "../lib/errors.js";
import { parseJson } from "../lib/validation.js";

export const lessonRoutes = new Hono<AppEnv>();

lessonRoutes.get("/lessons", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: lessons.id,
      slug: lessons.slug,
      title: lessons.title,
      level: lessons.level,
      summary: lessons.summary,
      content: lessons.content,
      attempts: sql<number>`count(${lessonAttempts.id})::int`,
      bestScore: sql<
        number | null
      >`max(round(${lessonAttempts.score} * 100.0 / nullif(${lessonAttempts.total}, 0)))::int`
    })
    .from(lessons)
    .leftJoin(
      lessonAttempts,
      and(eq(lessonAttempts.lessonId, lessons.id), eq(lessonAttempts.userId, user.id))
    )
    .groupBy(lessons.id)
    .orderBy(asc(lessons.title));

  return c.json({
    lessons: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      level: row.level as Level,
      summary: row.summary,
      questionCount: (row.content as LessonContent).quiz.length,
      bestScore: row.bestScore ?? null,
      attempts: row.attempts
    }))
  });
});

lessonRoutes.get("/lessons/:slug", async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.slug, slug) });
  if (!lesson) throw new AppError(404, "lesson_not_found", "That lesson does not exist.");

  const [stats] = await db
    .select({
      attempts: sql<number>`count(*)::int`,
      bestScore: sql<
        number | null
      >`max(round(${lessonAttempts.score} * 100.0 / nullif(${lessonAttempts.total}, 0)))::int`
    })
    .from(lessonAttempts)
    .where(and(eq(lessonAttempts.userId, user.id), eq(lessonAttempts.lessonId, lesson.id)));

  const content = lessonContentSchema.parse(lesson.content);

  return c.json({
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    level: lesson.level as Level,
    summary: lesson.summary,
    questionCount: content.quiz.length,
    bestScore: stats?.bestScore ?? null,
    attempts: stats?.attempts ?? 0,
    content
  });
});

lessonRoutes.post("/lessons/:slug/attempts", async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const input = await parseJson(c, lessonAttemptSchema);

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.slug, slug) });
  if (!lesson) throw new AppError(404, "lesson_not_found", "That lesson does not exist.");

  const xp = 10 + input.score * 3;

  const profile = await db.transaction(async (tx) => {
    await tx.insert(lessonAttempts).values({
      userId: user.id,
      lessonId: lesson.id,
      score: input.score,
      total: input.total
    });

    return awardXp(tx, user.id, xp, { lessons: 1 });
  });

  return c.json({
    ok: true,
    xpGained: xp,
    totalXp: profile.xp,
    streak: profile.streak
  });
});
