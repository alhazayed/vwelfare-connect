CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"mfa_ok" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_number" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"record_name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"finished_by" text,
	"risk" boolean DEFAULT false NOT NULL,
	"auto_replied" boolean DEFAULT false NOT NULL,
	"reminded_at" timestamp with time zone,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_number" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"sender" text NOT NULL,
	"kind" text NOT NULL,
	"text_enc" text,
	"attachment_id" uuid,
	"risk" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"file_number" text PRIMARY KEY NOT NULL,
	"username" text,
	"password_hash" text,
	"mobile_enc" text,
	"status" text NOT NULL,
	"invited_by" uuid,
	"terms_accepted_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "provider_patients" (
	"provider_id" uuid NOT NULL,
	"file_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_patients_provider_id_file_number_pk" PRIMARY KEY("provider_id","file_number")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"specialty_en" text,
	"specialty_ar" text,
	"emr_staff_id" text,
	"password_hash" text,
	"mfa_secret_enc" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_file_number_patients_file_number_fk" FOREIGN KEY ("file_number") REFERENCES "public"."patients"("file_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_provider_id_staff_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_file_number_patients_file_number_fk" FOREIGN KEY ("file_number") REFERENCES "public"."patients"("file_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_provider_id_staff_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_invited_by_staff_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_patients" ADD CONSTRAINT "provider_patients_provider_id_staff_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_patients" ADD CONSTRAINT "provider_patients_file_number_patients_file_number_fk" FOREIGN KEY ("file_number") REFERENCES "public"."patients"("file_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "chat_sessions_file_provider" ON "chat_sessions" USING btree ("file_number","provider_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_status" ON "chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_file_provider" ON "consents" USING btree ("file_number","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_session_seq" ON "messages" USING btree ("session_id","seq");