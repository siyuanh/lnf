-- Replace tag_state enum: 'unactivated'/'revoked' rename to 'inactive'/'deprecated';
-- add 'registered' value. Postgres can't drop a value in use, so we rebuild the type.
ALTER TYPE "public"."tag_state" RENAME TO "tag_state__old";--> statement-breakpoint
CREATE TYPE "public"."tag_state" AS ENUM('inactive', 'active', 'registered', 'deprecated');--> statement-breakpoint
ALTER TABLE "tag" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tag" ALTER COLUMN "state" SET DATA TYPE "public"."tag_state" USING (
  CASE "state"::text
    WHEN 'unactivated' THEN 'inactive'
    WHEN 'revoked' THEN 'deprecated'
    ELSE "state"::text
  END
)::"public"."tag_state";--> statement-breakpoint
ALTER TABLE "tag" ALTER COLUMN "state" SET DEFAULT 'inactive';--> statement-breakpoint
DROP TYPE "public"."tag_state__old";--> statement-breakpoint
ALTER TABLE "tag" RENAME COLUMN "revoked_at" TO "deprecated_at";
