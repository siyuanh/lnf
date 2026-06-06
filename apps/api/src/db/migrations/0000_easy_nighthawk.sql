CREATE TYPE "public"."partner_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."partner_user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."tag_state" AS ENUM('unactivated', 'active', 'revoked');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid,
	"partner_id" uuid,
	"find_id" uuid,
	"kind" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"billing_email" text NOT NULL,
	"status" "partner_status" DEFAULT 'active' NOT NULL,
	"settings" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "partner_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "partner_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "partner_user_role" DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "partner_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"state" "tag_state" DEFAULT 'unactivated' NOT NULL,
	"protected_person_id" uuid,
	"caregiver_id" uuid,
	"label" text,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "tag_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tag_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"size" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"csv_token_hash" text,
	"csv_token_expires_at" timestamp with time zone,
	"csv_downloaded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "partner_api_key" ADD CONSTRAINT "partner_api_key_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_user" ADD CONSTRAINT "partner_user_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_batch_id_tag_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tag_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_batch" ADD CONSTRAINT "tag_batch_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_api_key_prefix_idx" ON "partner_api_key" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "tag_partner_batch_state_idx" ON "tag" USING btree ("partner_id","batch_id","state");