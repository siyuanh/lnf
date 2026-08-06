ALTER TABLE "caregiver_contact" ADD COLUMN "relationship" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "blood_type" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "medical_conditions" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "allergies" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "medications" text;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "primary_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "protected_person" ADD COLUMN "secondary_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "protected_person" ADD CONSTRAINT "protected_person_primary_contact_id_caregiver_contact_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."caregiver_contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_person" ADD CONSTRAINT "protected_person_secondary_contact_id_caregiver_contact_id_fk" FOREIGN KEY ("secondary_contact_id") REFERENCES "public"."caregiver_contact"("id") ON DELETE no action ON UPDATE no action;