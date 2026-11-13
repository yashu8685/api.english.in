ALTER TABLE "speaking_attempts" ADD COLUMN "pronunciation_score" integer;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD COLUMN "audio_path" text;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD COLUMN "audio_mime" text;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD COLUMN "assessment" jsonb;