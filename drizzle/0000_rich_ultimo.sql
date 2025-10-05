CREATE TYPE "public"."lease_status" AS ENUM('draft', 'active', 'expiring', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('submitted', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mobile_money_provider" AS ENUM('mtn', 'airtel', 'm-sente');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'landlord', 'tenant');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"monthly_rent" numeric(10, 2) NOT NULL,
	"deposit" numeric(10, 2) NOT NULL,
	"payment_day" integer DEFAULT 1 NOT NULL,
	"previous_lease_id" uuid,
	"status" "lease_status" DEFAULT 'draft' NOT NULL,
	"terms" text,
	"notes" text,
	"auto_renew" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" "maintenance_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"payment_number" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_payment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_lease_payment_number" UNIQUE("lease_id","payment_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"schedule_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_date" timestamp,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(50),
	"mobile_money_provider" "mobile_money_provider",
	"phone_number" varchar(20),
	"transaction_id" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(50) NOT NULL,
	"postal_code" varchar(10),
	"description" text,
	"landlord_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_number" varchar(50) NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" numeric(3, 1) NOT NULL,
	"square_feet" integer,
	"is_available" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_unit_per_property" UNIQUE("property_id","unit_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"user_name" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_user_name_unique" UNIQUE("user_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_users_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leases" ADD CONSTRAINT "leases_previous_lease_id_leases_id_fk" FOREIGN KEY ("previous_lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenant_id_users_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_paid_payment_id_payments_id_fk" FOREIGN KEY ("paid_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_users_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leases_tenant_id" ON "leases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leases_unit_id" ON "leases" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leases_status" ON "leases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leases_date_range" ON "leases" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_requests_tenant_id" ON "maintenance_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_requests_unit_id" ON "maintenance_requests" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_requests_status" ON "maintenance_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_requests_priority" ON "maintenance_requests" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_requests_submitted_at" ON "maintenance_requests" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_schedules_lease_id" ON "payment_schedules" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_schedules_due_date" ON "payment_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_schedules_is_paid" ON "payment_schedules" USING btree ("is_paid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_lease_id" ON "payments" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_due_date" ON "payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_transaction_id" ON "payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_landlord_id" ON "properties" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_city" ON "properties" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_units_property_id" ON "units" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_units_availability" ON "units" USING btree ("is_available");