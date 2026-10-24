CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"built_in" boolean NOT NULL,
	"name" text,
	"description" text,
	"address_enc" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;