CREATE TYPE "public"."find_location_kind" AS ENUM('gps', 'address');--> statement-breakpoint
CREATE TABLE "find" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"location_kind" "find_location_kind" NOT NULL,
	"lat" text,
	"lon" text,
	"accuracy_m" integer,
	"address_text" text,
	"finder_message" text,
	"finder_contact" text,
	"finder_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "find" ADD CONSTRAINT "find_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "find_tag_idx" ON "find" USING btree ("tag_id","created_at");