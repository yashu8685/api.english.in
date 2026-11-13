CREATE TABLE "dictation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"clip_id" uuid NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictation_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"text" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scenario" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictation_attempts" ADD CONSTRAINT "dictation_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictation_attempts" ADD CONSTRAINT "dictation_attempts_clip_id_dictation_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."dictation_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictation_attempts_user_clip_idx" ON "dictation_attempts" USING btree ("user_id","clip_id");--> statement-breakpoint
CREATE INDEX "dictation_attempts_user_created_idx" ON "dictation_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dictation_clips_slug_idx" ON "dictation_clips" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_conversations_user_scenario_idx" ON "tutor_conversations" USING btree ("user_id","scenario");--> statement-breakpoint
CREATE INDEX "tutor_messages_conversation_idx" ON "tutor_messages" USING btree ("conversation_id","created_at");