CREATE TABLE IF NOT EXISTS "payment_schedule_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"amount_applied" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_payment_schedule" UNIQUE("payment_id","schedule_id")
);
--> statement-breakpoint
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_paid_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_schedule_id_payment_schedules_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_payments_due_date";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_schedule_payments" ADD CONSTRAINT "payment_schedule_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_schedule_payments" ADD CONSTRAINT "payment_schedule_payments_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_schedule_payments_payment_id" ON "payment_schedule_payments" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_schedule_payments_schedule_id" ON "payment_schedule_payments" USING btree ("schedule_id");--> statement-breakpoint
ALTER TABLE "payment_schedules" DROP COLUMN IF EXISTS "paid_payment_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "schedule_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "due_date";