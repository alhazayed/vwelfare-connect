CREATE TABLE "live_versions" (
	"key" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
