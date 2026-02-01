CREATE TYPE "public"."wallet_transaction_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('deposit', 'withdrawal', 'adjustment');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landlord_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deposited" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_withdrawn" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landlord_wallets_landlord_id_unique" UNIQUE("landlord_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" "wallet_transaction_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"status" "wallet_transaction_status" DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"gateway_reference" varchar(255),
	"destination_type" varchar(50),
	"destination_details" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "gateway" SET DEFAULT 'yo';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landlord_wallets" ADD CONSTRAINT "landlord_wallets_landlord_id_users_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_landlord_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."landlord_wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_landlord_wallets_landlord_id" ON "landlord_wallets" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_wallet_id" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_type" ON "wallet_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_status" ON "wallet_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_payment_id" ON "wallet_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_transactions_created_at" ON "wallet_transactions" USING btree ("created_at");