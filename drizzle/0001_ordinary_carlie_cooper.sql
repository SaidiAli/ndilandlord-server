ALTER TABLE "properties" ADD COLUMN "number_of_units" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "state";