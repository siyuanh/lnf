CREATE TYPE "public"."caregiver_contact_kind" AS ENUM('phone', 'email', 'address');--> statement-breakpoint
CREATE TABLE "caregiver_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"kind" "caregiver_contact_kind" NOT NULL,
	"label" text,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "caregiver_contact" ADD CONSTRAINT "caregiver_contact_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caregiver_contact_caregiver_idx" ON "caregiver_contact" USING btree ("caregiver_id");