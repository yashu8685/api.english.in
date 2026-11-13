CREATE TABLE "speaking_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"phrase_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaking_phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"text" text NOT NULL,
	"focus" text NOT NULL,
	"tip" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_phrase_id_speaking_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."speaking_phrases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "speaking_attempts_user_phrase_idx" ON "speaking_attempts" USING btree ("user_id","phrase_id");--> statement-breakpoint
CREATE INDEX "speaking_attempts_user_created_idx" ON "speaking_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "speaking_phrases_slug_idx" ON "speaking_phrases" USING btree ("slug");