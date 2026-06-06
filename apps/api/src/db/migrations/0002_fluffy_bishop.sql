DROP INDEX "partner_api_key_prefix_idx";--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "payload" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "payload" SET DATA TYPE jsonb USING "payload"::jsonb;--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "partner_api_key" ADD CONSTRAINT "partner_api_key_prefix_unique" UNIQUE("key_prefix");
