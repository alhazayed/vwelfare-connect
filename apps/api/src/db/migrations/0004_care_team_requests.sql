ALTER TABLE "provider_patients" ADD COLUMN "status" text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_patients" ADD COLUMN "decided_at" timestamp with time zone;