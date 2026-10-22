// What the platform stores. Patient names and visit dates are never stored: they are read from the EMR when needed.
// Chat content (messages, attachments) lives here only until the EMR confirms it saved the chat.
import { pgTable, text, uuid, boolean, integer, timestamp, jsonb, primaryKey, uniqueIndex, index, bigserial } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: text("role", { enum: ["admin", "provider"] }).notNull(),
  email: text("email").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  specialtyEn: text("specialty_en"),
  specialtyAr: text("specialty_ar"),
  emrStaffId: text("emr_staff_id"),
  passwordHash: text("password_hash"),
  mfaSecretEnc: text("mfa_secret_enc"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  // The authenticator time step of the last accepted code, so the same code can't be used twice.
  mfaLastStep: integer("mfa_last_step"),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const patients = pgTable("patients", {
  fileNumber: text("file_number").primaryKey(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  mobileEnc: text("mobile_enc"),
  status: text("status", { enum: ["invited", "active", "deactivated"] }).notNull(),
  invitedBy: uuid("invited_by").references(() => staff.id),
  termsAcceptedAt: ts("terms_accepted_at"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["staff", "patient"] }).notNull(),
  subject: text("subject").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow()
});

// A provider who adds a patient already on the platform joins their care team only when the patient accepts
// ("pending" until then). The provider who first invites a patient is "accepted" from the start.
export const providerPatients = pgTable("provider_patients", {
  providerId: uuid("provider_id").notNull().references(() => staff.id),
  fileNumber: text("file_number").notNull().references(() => patients.fileNumber),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).notNull().default("accepted"),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at")
}, t => [primaryKey({ columns: [t.providerId, t.fileNumber] })]);

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileNumber: text("file_number").notNull().references(() => patients.fileNumber),
  providerId: uuid("provider_id").notNull().references(() => staff.id),
  status: text("status", { enum: ["pending", "granted", "denied", "withdrawn"] }).notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  decidedAt: ts("decided_at")
}, t => [uniqueIndex("consents_file_provider").on(t.fileNumber, t.providerId)]);

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileNumber: text("file_number").notNull().references(() => patients.fileNumber),
  providerId: uuid("provider_id").notNull().references(() => staff.id),
  recordName: text("record_name").notNull(),
  status: text("status", { enum: ["open", "locked"] }).notNull().default("open"),
  startedBy: text("started_by", { enum: ["patient", "provider"] }).notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  lastMessageAt: ts("last_message_at").notNull().defaultNow(),
  endedAt: ts("ended_at"),
  finishedBy: text("finished_by", { enum: ["provider", "auto", "deactivation"] }),
  risk: boolean("risk").notNull().default(false),
  autoReplied: boolean("auto_replied").notNull().default(false),
  remindedAt: ts("reminded_at"),
  syncAttempts: integer("sync_attempts").notNull().default(0),
  nextAttemptAt: ts("next_attempt_at"),
  // A short code ("emr_unavailable", "rejected_400_invalid_record"), never the EMR's own error text.
  lastError: text("last_error"),
  // When the admins were told this finished chat is stuck on its way to the EMR.
  alertedAt: ts("alerted_at")
}, t => [index("chat_sessions_file_provider").on(t.fileNumber, t.providerId), index("chat_sessions_status").on(t.status)]);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: ts("created_at").notNull().defaultNow()
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  sender: text("sender", { enum: ["patient", "provider", "system"] }).notNull(),
  kind: text("kind", { enum: ["text", "file", "started", "afterhours"] }).notNull(),
  textEnc: text("text_enc"),
  attachmentId: uuid("attachment_id").references(() => attachments.id, { onDelete: "cascade" }),
  risk: boolean("risk").notNull().default(false),
  sentAt: ts("sent_at").notNull().defaultNow()
}, t => [uniqueIndex("messages_session_seq").on(t.sessionId, t.seq)]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actorType: text("actor_type", { enum: ["admin", "provider", "patient", "system"] }).notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip")
}, t => [index("audit_log_at").on(t.at)]);

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  kind: text("kind", { enum: ["staff", "patient"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  mfaOk: boolean("mfa_ok").notNull().default(false),
  // Super admin only: until when the secrets list is unlocked in this session.
  vaultUntil: ts("vault_until"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull()
});

// Credentials and addresses of the services the app connects to (EMR, SMS, email, virus scanning).
// Values are encrypted; when a name has no row here, the value comes from the .env file.
export const secrets = pgTable("secrets", {
  name: text("name").primaryKey(),
  valueEnc: text("value_enc").notNull(),
  description: text("description"),
  isSecret: boolean("is_secret").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => staff.id)
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull()
});
