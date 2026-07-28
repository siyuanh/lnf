CREATE TYPE "public"."channel_kind" AS ENUM('push', 'email', 'sms', 'voice');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."find_status" AS ENUM('reported', 'acknowledged', 'claimed', 'resolved', 'false_positive', 'expired');--> statement-breakpoint
CREATE TYPE "public"."spend_kind" AS ENUM('sms', 'voice');--> statement-breakpoint
CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_expo_push_token_unique" UNIQUE("expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "notification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"find_id" uuid NOT NULL,
	"channel_kind" "channel_kind" NOT NULL,
	"channel_target" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_message_id" text,
	"delivery_status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"cost_minor_units" integer DEFAULT 0 NOT NULL,
	"ack_link_expires_at" timestamp with time zone,
	"ack_link_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"protected_person_id" uuid,
	"kind" "channel_kind" NOT NULL,
	"target" text NOT NULL,
	"verified_at" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"escalation_delay_seconds" integer DEFAULT 300 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"day" text NOT NULL,
	"kind" "spend_kind" NOT NULL,
	"cost_minor_units" integer DEFAULT 0 NOT NULL,
	"country_code" text,
	CONSTRAINT "spend_ledger_day_kind_unique" UNIQUE("caregiver_id","day","kind")
);
--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "status" "find_status" DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "find" ADD COLUMN "is_collapsed_into" uuid;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempt" ADD CONSTRAINT "notification_attempt_find_id_find_id_fk" FOREIGN KEY ("find_id") REFERENCES "public"."find"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_protected_person_id_protected_person_id_fk" FOREIGN KEY ("protected_person_id") REFERENCES "public"."protected_person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_attempt_find_idx" ON "notification_attempt" USING btree ("find_id");--> statement-breakpoint
CREATE INDEX "notification_channel_caregiver_idx" ON "notification_channel" USING btree ("caregiver_id","priority");