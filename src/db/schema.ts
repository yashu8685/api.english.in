import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

/* ══════════════════════════════════════════════════════════════════════════
 * Better Auth tables
 * These must match Better Auth's expected shape. Column names are snake_case;
 * the property names are what Better Auth's drizzle adapter reads.
 * ══════════════════════════════════════════════════════════════════════════ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
  },
  (t) => [index("session_user_id_idx").on(t.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("account_user_id_idx").on(t.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
);

/* ══════════════════════════════════════════════════════════════════════════
 * Application tables
 * ══════════════════════════════════════════════════════════════════════════ */

/** One row per user. Created on first authenticated request. */
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  level: text("level").notNull().default("B1"),
  dailyGoal: integer("daily_goal").notNull().default(10),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  lastStudyOn: date("last_study_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

/** Global content — the deck. Not user specific. */
export const words = pgTable(
  "words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    term: text("term").notNull(),
    pos: text("pos").notNull(),
    ipa: text("ipa"),
    meaning: text("meaning").notNull(),
    example: text("example").notNull(),
    synonyms: text("synonyms").notNull().default(""),
    level: text("level").notNull().default("B1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("words_slug_idx").on(t.slug)]
);

/** Per-user spaced-repetition state for a word. */
export const userWords = pgTable(
  "user_words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wordId: uuid("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    ease: real("ease").notNull().default(2.5),
    intervalDays: integer("interval_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("user_words_user_word_idx").on(t.userId, t.wordId),
    index("user_words_due_idx").on(t.userId, t.dueAt)
  ]
);

/** Global lessons. `content` holds sections/examples/mistakes/quiz JSON. */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    level: text("level").notNull().default("B1"),
    summary: text("summary").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("lessons_slug_idx").on(t.slug)]
);

export const lessonAttempts = pgTable(
  "lesson_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("lesson_attempts_user_lesson_idx").on(t.userId, t.lessonId)]
);

/**
 * Global speaking drill phrases. British-English targets with a sound focus
 * and a short coaching tip shown next to the model audio.
 */
export const speakingPhrases = pgTable(
  "speaking_phrases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    text: text("text").notNull(),
    focus: text("focus").notNull(),
    tip: text("tip").notNull().default(""),
    level: text("level").notNull().default("B1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("speaking_phrases_slug_idx").on(t.slug)]
);

/** One row per spoken attempt. `score` is server-computed word accuracy. */
export const speakingAttempts = pgTable(
  "speaking_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    phraseId: uuid("phrase_id")
      .notNull()
      .references(() => speakingPhrases.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    /** Azure pronunciation score when phoneme assessment ran, else null. */
    pronunciationScore: integer("pronunciation_score"),
    transcript: text("transcript").notNull().default(""),
    /** Relative path inside AUDIO_STORAGE_DIR, only set when the learner opted in. */
    audioPath: text("audio_path"),
    audioMime: text("audio_mime"),
    /** Full SpeechAssessment payload, kept for replaying detailed feedback. */
    assessment: jsonb("assessment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("speaking_attempts_user_phrase_idx").on(t.userId, t.phraseId),
    index("speaking_attempts_user_created_idx").on(t.userId, t.createdAt)
  ]
);

/** Global dictation clips. The browser reads `text` aloud with an en-GB voice. */
export const dictationClips = pgTable(
  "dictation_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    text: text("text").notNull(),
    hint: text("hint").notNull().default(""),
    level: text("level").notNull().default("B1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("dictation_clips_slug_idx").on(t.slug)]
);

/** One row per dictation attempt. */
export const dictationAttempts = pgTable(
  "dictation_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => dictationClips.id, { onDelete: "cascade" }),
    transcript: text("transcript").notNull().default(""),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("dictation_attempts_user_clip_idx").on(t.userId, t.clipId),
    index("dictation_attempts_user_created_idx").on(t.userId, t.createdAt)
  ]
);

/** One conversation per user per scenario; history lives in tutor_messages. */
export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scenario: text("scenario").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("tutor_conversations_user_scenario_idx").on(t.userId, t.scenario)]
);

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("tutor_messages_conversation_idx").on(t.conversationId, t.createdAt)]
);

/** Daily XP ledger — powers the activity chart without extra aggregation. */
export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    xp: integer("xp").notNull().default(0),
    cards: integer("cards").notNull().default(0),
    lessonsDone: integer("lessons_done").notNull().default(0)
  },
  (t) => [uniqueIndex("daily_activity_user_day_idx").on(t.userId, t.day)]
);

/* ─────────────────────────────── relations ─────────────────────────────── */

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(profiles, { fields: [user.id], references: [profiles.userId] }),
  userWords: many(userWords),
  attempts: many(lessonAttempts),
  speakingAttempts: many(speakingAttempts),
  dictationAttempts: many(dictationAttempts),
  tutorConversations: many(tutorConversations),
  activity: many(dailyActivity)
}));

export const userWordRelations = relations(userWords, ({ one }) => ({
  user: one(user, { fields: [userWords.userId], references: [user.id] }),
  word: one(words, { fields: [userWords.wordId], references: [words.id] })
}));

export const lessonAttemptRelations = relations(lessonAttempts, ({ one }) => ({
  user: one(user, { fields: [lessonAttempts.userId], references: [user.id] }),
  lesson: one(lessons, { fields: [lessonAttempts.lessonId], references: [lessons.id] })
}));

export const speakingAttemptRelations = relations(speakingAttempts, ({ one }) => ({
  user: one(user, { fields: [speakingAttempts.userId], references: [user.id] }),
  phrase: one(speakingPhrases, {
    fields: [speakingAttempts.phraseId],
    references: [speakingPhrases.id]
  })
}));

export const dictationAttemptRelations = relations(dictationAttempts, ({ one }) => ({
  user: one(user, { fields: [dictationAttempts.userId], references: [user.id] }),
  clip: one(dictationClips, {
    fields: [dictationAttempts.clipId],
    references: [dictationClips.id]
  })
}));

export const tutorConversationRelations = relations(tutorConversations, ({ one, many }) => ({
  user: one(user, { fields: [tutorConversations.userId], references: [user.id] }),
  messages: many(tutorMessages)
}));

export const tutorMessageRelations = relations(tutorMessages, ({ one }) => ({
  conversation: one(tutorConversations, {
    fields: [tutorMessages.conversationId],
    references: [tutorConversations.id]
  })
}));

/* ───────────────────────────────── types ───────────────────────────────── */

export type User = typeof user.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Word = typeof words.$inferSelect;
export type UserWord = typeof userWords.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type LessonAttempt = typeof lessonAttempts.$inferSelect;
export type SpeakingPhrase = typeof speakingPhrases.$inferSelect;
export type SpeakingAttempt = typeof speakingAttempts.$inferSelect;
export type DictationClip = typeof dictationClips.$inferSelect;
export type DictationAttempt = typeof dictationAttempts.$inferSelect;
export type TutorConversation = typeof tutorConversations.$inferSelect;
export type TutorMessage = typeof tutorMessages.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type NewWord = typeof words.$inferInsert;
export type NewLesson = typeof lessons.$inferInsert;
export type NewSpeakingPhrase = typeof speakingPhrases.$inferInsert;
export type NewDictationClip = typeof dictationClips.$inferInsert;
