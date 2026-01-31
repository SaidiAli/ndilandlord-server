CREATE TYPE "public"."payment_gateway" AS ENUM('iotec', 'yo');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway" "payment_gateway" DEFAULT 'iotec';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_reference" varchar(255);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_raw_response" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_gateway" ON "payments" USING btree ("gateway");