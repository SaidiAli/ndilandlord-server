CREATE TYPE "public"."amenity_type" AS ENUM('residential', 'commercial', 'common');--> statement-breakpoint
CREATE TYPE "public"."commercial_unit_type" AS ENUM('office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other');--> statement-breakpoint
CREATE TYPE "public"."residential_unit_type" AS ENUM('apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commercial_unit_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_type" "commercial_unit_type" DEFAULT 'office' NOT NULL,
	"floor_number" integer,
	"suite_number" varchar(50),
	"ceiling_height" numeric(5, 2),
	"max_occupancy" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_unit_details_unit_id_unique" UNIQUE("unit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "residential_unit_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_type" "residential_unit_type" DEFAULT 'apartment' NOT NULL,
	"bedrooms" integer DEFAULT 1 NOT NULL,
	"bathrooms" integer DEFAULT 0 NOT NULL,
	"has_balcony" boolean DEFAULT false,
	"floor_number" integer,
	"is_furnished" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "residential_unit_details_unit_id_unique" UNIQUE("unit_id")
);
--> statement-breakpoint
ALTER TABLE "unit_amenities" DROP CONSTRAINT "unit_amenities_unit_id_units_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_amenities" DROP CONSTRAINT "unit_amenities_amenity_id_amenities_id_fk";
--> statement-breakpoint
ALTER TABLE "amenities" ADD COLUMN "type" "amenity_type" DEFAULT 'common' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commercial_unit_details" ADD CONSTRAINT "commercial_unit_details_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "residential_unit_details" ADD CONSTRAINT "residential_unit_details_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commercial_unit_details_unit_id" ON "commercial_unit_details" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commercial_unit_details_type" ON "commercial_unit_details" USING btree ("unit_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_residential_unit_details_unit_id" ON "residential_unit_details" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_residential_unit_details_type" ON "residential_unit_details" USING btree ("unit_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_residential_unit_details_bedrooms" ON "residential_unit_details" USING btree ("bedrooms");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_amenities" ADD CONSTRAINT "unit_amenities_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_amenities" ADD CONSTRAINT "unit_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_amenities_type" ON "amenities" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_type" ON "properties" USING btree ("type");--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "bedrooms";--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "bathrooms";--> statement-breakpoint
ALTER TABLE "public"."properties" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."properties" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."property_type";--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('residential', 'commercial');--> statement-breakpoint
ALTER TABLE "public"."properties" ALTER COLUMN "type" SET DATA TYPE "public"."property_type" USING "type"::"public"."property_type";--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" SET DEFAULT 'residential';--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" SET NOT NULL;