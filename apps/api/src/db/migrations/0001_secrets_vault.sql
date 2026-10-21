CREATE TABLE "secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"value_enc" text NOT NULL,
	"description" text,
	"is_secret" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "vault_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;