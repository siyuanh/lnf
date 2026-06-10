CREATE TABLE "caregiver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "caregiver_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "protected_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"public_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "caregiver" ADD CONSTRAINT "caregiver_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protected_person" ADD CONSTRAINT "protected_person_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_caregiver_id_caregiver_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregiver"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_protected_person_id_protected_person_id_fk" FOREIGN KEY ("protected_person_id") REFERENCES "public"."protected_person"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "protected_person_caregiver_idx" ON "protected_person" ("caregiver_id");
