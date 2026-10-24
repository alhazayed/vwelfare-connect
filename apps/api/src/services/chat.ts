// Chat lifecycle: open → locked → saved to the EMR → deleted from the platform.
import { and, asc, eq, isNull, lt, lte, max, or } from "drizzle-orm";
import { attachments, chatSessions, messages, staff } from "../db/schema.ts";
import { HttpError, type Deps } from "../deps.ts";
import { baseRecordName, isoLocal, isWithinWorkingHours } from "../lib/time.ts";
import { hasRiskWords } from "../lib/risk.ts";
import { sha256 } from "../lib/crypto.ts";
import { patientKey, staffKey } from "../realtime.ts";
import { EmrRejected, EmrTurnedOff, EmrUnavailable, type EmrRecord } from "../emr/client.ts";
import { audit, type Actor } from "./audit.ts";
import { getRules } from "./rules.ts";

export type SessionRow = typeof chatSessions.$inferSelect;
type FinishedBy = "provider" | "auto" | "deactivation";

const BACKOFF_SECONDS = [30, 120, 600, 1800];
// A chat the EMR refused is tried again only every 6 hours: the admins are told and someone has to look at it.
const REJECTED_RETRY_SECONDS = 6 * 3600;
// The specification asks for an alert when a finished chat has waited for the EMR longer than this.
const QUEUE_ALERT_MS = 3600_000;
export const MAX_TEXT = 4000;
const AUTO_REPLY_EN = "Outside working hours. Your message will be read on the next working day. In an emergency, use Need urgent help.";

const notifyChange = (deps: Deps, s: Pick<SessionRow, "fileNumber" | "providerId">) =>
  deps.hub.publish([staffKey(s.providerId), patientKey(s.fileNumber)], { type: "chat", fileNumber: s.fileNumber, providerId: s.providerId });

export function findSession(deps: Deps, fileNumber: string, providerId: string, status: "open" | "locked") {
  return deps.db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.fileNumber, fileNumber), eq(chatSessions.providerId, providerId), eq(chatSessions.status, status))
  });
}

export async function startSession(deps: Deps, fileNumber: string, providerId: string, by: "patient" | "provider", actor: Actor): Promise<SessionRow> {
  const now = deps.now();
  const base = baseRecordName(fileNumber, now, deps.config.CENTER_TIMEZONE);
  // Names in use: chats still on the platform, plus chats already saved to the EMR (the platform keeps no copy of those).
  const taken = new Set((await deps.db.select({ n: chatSessions.recordName }).from(chatSessions).where(eq(chatSessions.fileNumber, fileNumber))).map(r => r.n));
  for (const r of await deps.emr.listChatRecords(fileNumber).catch(() => [])) taken.add(r.recordName);
  let recordName = base;
  for (let i = 2; taken.has(recordName); i++) recordName = `${base}_${i}`;

  const [s] = await deps.db.insert(chatSessions).values({ fileNumber, providerId, recordName, startedBy: by, startedAt: now, lastMessageAt: now }).returning();
  await deps.db.insert(messages).values({ sessionId: s!.id, seq: 1, sender: "system", kind: "started", sentAt: now });
  await audit(deps, actor, "chat_started", fileNumber, { providerId });
  notifyChange(deps, s!);
  return s!;
}

export type NewContent = { text: string } | { file: { name: string; mimeType: string; content: Buffer } };

export async function addMessage(deps: Deps, s: SessionRow, sender: "patient" | "provider", content: NewContent) {
  if (s.status !== "open") throw new HttpError(409, "chat_locked", "This chat is finished");
  const now = deps.now();
  const storageKey = "file" in content ? await deps.files.put(content.file.content) : null;
  const text = "text" in content ? content.text.trim().slice(0, MAX_TEXT) : null;
  const risk = sender === "patient" && !!text && hasRiskWords(text);

  const rules = await getRules(deps);
  const afterHours = sender === "patient" && !s.autoReplied && !isWithinWorkingHours(now, rules.workingHours, deps.config.CENTER_TIMEZONE);

  try {
    await deps.db.transaction(async tx => {
      // `s` may have been read before the chat was finished. Lock the row and check again: finishing waits for this
      // insert, or this insert sees the chat locked. Otherwise the message would be deleted without reaching the EMR.
      const [cur] = await tx.select({ status: chatSessions.status }).from(chatSessions).where(eq(chatSessions.id, s.id)).for("update");
      if (cur?.status !== "open") throw new HttpError(409, "chat_locked", "This chat is finished");
      let attachmentId: string | null = null;
      if ("file" in content) {
        const [a] = await tx.insert(attachments).values({
          sessionId: s.id, fileName: content.file.name, mimeType: content.file.mimeType, sizeBytes: content.file.content.length,
          sha256: sha256(content.file.content), storageKey: storageKey!, createdAt: now
        }).returning();
        attachmentId = a!.id;
      }
      const [row] = await tx.select({ m: max(messages.seq) }).from(messages).where(eq(messages.sessionId, s.id));
      let seq = (row?.m ?? 0) + 1;
      await tx.insert(messages).values({
        sessionId: s.id, seq: seq++, sender, kind: attachmentId ? "file" : "text",
        textEnc: text ? deps.cipher.encrypt(text) : null, attachmentId, risk, sentAt: now
      });
      if (afterHours) await tx.insert(messages).values({ sessionId: s.id, seq: seq++, sender: "system", kind: "afterhours", sentAt: now });
      await tx.update(chatSessions).set({
        lastMessageAt: now,
        remindedAt: null,
        ...(risk ? { risk: true } : {}),
        ...(afterHours ? { autoReplied: true } : {})
      }).where(eq(chatSessions.id, s.id));
    });
  } catch (e) {
    if (storageKey) await deps.files.delete(storageKey);
    throw e;
  }

  if (risk && !s.risk) {
    await audit(deps, { type: "system" }, "risk_words_flagged", s.fileNumber, { providerId: s.providerId });
    const p = await deps.db.query.staff.findFirst({ where: eq(staff.id, s.providerId) });
    if (p) await deps.notifier.email(p.email, "A chat needs your attention", "A patient message in Vwelfare Connect contains words that may signal risk. Sign in to review it and follow the clinical risk protocol.");
  }
  notifyChange(deps, s);
}

export async function sessionView(deps: Deps, s: SessionRow) {
  const rows = await deps.db.select().from(messages).where(eq(messages.sessionId, s.id)).orderBy(asc(messages.seq));
  const atts = await deps.db.select().from(attachments).where(eq(attachments.sessionId, s.id));
  const fresh = await deps.db.query.chatSessions.findFirst({ where: eq(chatSessions.id, s.id) });
  const cur = fresh ?? s;
  return {
    id: cur.id,
    recordName: cur.recordName,
    status: cur.status,
    startedBy: cur.startedBy,
    startedAt: cur.startedAt,
    lastMessageAt: cur.lastMessageAt,
    risk: cur.risk,
    messages: rows.map(m => {
      const a = m.attachmentId ? atts.find(x => x.id === m.attachmentId) : undefined;
      return {
        id: m.id, seq: m.seq, sender: m.sender, kind: m.kind, risk: m.risk, sentAt: m.sentAt,
        text: m.textEnc ? deps.cipher.decrypt(m.textEnc) : undefined,
        attachment: a ? { id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes } : undefined
      };
    })
  };
}

// While one caller is sending a chat to the EMR, the worker leaves it alone for this long.
export const LEASE_MS = 2 * 60_000;

export async function finishSession(deps: Deps, s: SessionRow, finishedBy: FinishedBy, actor: Actor): Promise<{ status: "saved" | "queued"; recordName: string }> {
  const now = deps.now();
  // Locking also takes the lease, so the background worker doesn't send the same chat at the same time.
  const locked = await deps.db.update(chatSessions)
    .set({ status: "locked", endedAt: now, finishedBy, nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(chatSessions.id, s.id), eq(chatSessions.status, "open")))
    .returning({ id: chatSessions.id });
  if (!locked.length) {
    // Someone else finished it first and holds the lease: leave the sending to them.
    const cur = await deps.db.query.chatSessions.findFirst({ where: eq(chatSessions.id, s.id) });
    return { status: cur ? "queued" : "saved", recordName: s.recordName };
  }
  await audit(deps, actor, "chat_finished", s.recordName, { finishedBy });
  notifyChange(deps, s);
  const r = await syncSession(deps, s.id);
  return { status: r.status === "queued" ? "queued" : "saved", recordName: s.recordName };
}

/**
 * Numbers for the admin's reports, kept in the audit log once the chat itself is deleted:
 * who the provider was, minutes from the patient's first message to the provider's first reply,
 * and whether it arrived after hours. Never text, names or file contents.
 */
export function chatStats(s: SessionRow, rows: Array<{ sender: string; kind: string; sentAt: Date }>) {
  const said = rows.filter(m => m.kind === "text" || m.kind === "file");
  const firstPatient = said.find(m => m.sender === "patient");
  const reply = firstPatient && said.find(m => m.sender === "provider" && m.sentAt >= firstPatient.sentAt);
  return {
    providerId: s.providerId,
    firstReplyMinutes: firstPatient && reply ? Math.round((reply.sentAt.getTime() - firstPatient.sentAt.getTime()) / 60_000) : null,
    afterHours: s.autoReplied,
    risk: s.risk
  };
}

/** Sends a locked chat to the EMR. On success, deletes every trace of its content from the platform. */
export async function syncSession(deps: Deps, sessionId: string): Promise<{ status: "saved" | "queued" | "gone"; recordName?: string }> {
  const s = await deps.db.query.chatSessions.findFirst({ where: eq(chatSessions.id, sessionId) });
  if (!s || s.status !== "locked") return { status: "gone" };
  const tz = deps.config.CENTER_TIMEZONE;
  const provider = await deps.db.query.staff.findFirst({ where: eq(staff.id, s.providerId) });
  const rows = await deps.db.select().from(messages).where(eq(messages.sessionId, s.id)).orderBy(asc(messages.seq));
  const atts = await deps.db.select().from(attachments).where(eq(attachments.sessionId, s.id));

  const record: EmrRecord = {
    recordName: s.recordName,
    fileNumber: s.fileNumber,
    provider: { staffId: provider?.emrStaffId ?? "", name: provider?.nameEn ?? "" },
    startedAt: isoLocal(s.startedAt, tz),
    endedAt: isoLocal(s.endedAt ?? deps.now(), tz),
    finishedBy: s.finishedBy ?? "provider",
    messages: rows.map(m => ({
      seq: m.seq,
      sentAt: isoLocal(m.sentAt, tz),
      sender: m.sender,
      text: m.kind === "text" ? deps.cipher.decrypt(m.textEnc!)
        : m.kind === "started" ? `Conversation started by the ${s.startedBy}`
        : m.kind === "afterhours" ? AUTO_REPLY_EN
        : undefined,
      attachmentId: m.attachmentId ?? undefined
    })),
    attachments: atts.map(a => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, sha256: a.sha256 }))
  };

  try {
    const contents = await Promise.all(atts.map(async a => ({ id: a.id, content: await deps.files.get(a.storageKey) })));
    const saved = await deps.emr.saveChatRecord(record, contents, s.id);
    await deps.db.transaction(async tx => {
      await tx.delete(messages).where(eq(messages.sessionId, s.id));
      await tx.delete(attachments).where(eq(attachments.sessionId, s.id));
      await tx.delete(chatSessions).where(eq(chatSessions.id, s.id));
    });
    await Promise.all(atts.map(a => deps.files.delete(a.storageKey)));
    await audit(deps, { type: "system" }, "chat_saved_to_emr", s.recordName, {
      emrRecordId: saved.recordId, attempts: s.syncAttempts + 1, ...chatStats(s, rows)
    });
    notifyChange(deps, s);
    return { status: "saved", recordName: s.recordName };
  } catch (e) {
    if (e instanceof EmrTurnedOff) {
      // Not an attempt: nothing was sent. The chat waits, locked, until the admin turns the EMR back on; the worker
      // leaves it alone meanwhile and sends it on its first run after that (nextAttemptAt null = due).
      await deps.db.update(chatSessions).set({ nextAttemptAt: null, lastError: "emr_off" }).where(eq(chatSessions.id, s.id));
      if (s.lastError !== "emr_off") await audit(deps, { type: "system" }, "chat_sync_queued", s.recordName, { reason: "emr_off" });
      return { status: "queued", recordName: s.recordName };
    }
    const attempts = s.syncAttempts + 1;
    const rejected = e instanceof EmrRejected;
    const reason = rejected ? `rejected_${e.status}_${e.code}` : e instanceof EmrUnavailable ? "emr_unavailable" : "sync_failed";
    const delay = rejected ? REJECTED_RETRY_SECONDS : BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]!;
    await deps.db.update(chatSessions).set({
      syncAttempts: attempts,
      nextAttemptAt: new Date(deps.now().getTime() + delay * 1000),
      lastError: reason
    }).where(eq(chatSessions.id, s.id));
    if (attempts === 1) await audit(deps, { type: "system" }, "chat_sync_queued", s.recordName, { reason });
    if (rejected && s.lastError !== reason) await audit(deps, { type: "system" }, "chat_sync_rejected", s.recordName, { reason });
    if (rejected) await alertAdmins(deps, s.id, s.recordName, reason);
    return { status: "queued", recordName: s.recordName };
  }
}

/** Tells the admins, once per chat, that a finished chat isn't reaching the EMR. The email names no patient or chat. */
async function alertAdmins(deps: Deps, sessionId: string, recordName: string, reason: string) {
  const claimed = await deps.db.update(chatSessions).set({ alertedAt: deps.now() })
    .where(and(eq(chatSessions.id, sessionId), isNull(chatSessions.alertedAt)))
    .returning({ id: chatSessions.id });
  if (!claimed.length) return;
  const admins = await deps.db.select({ email: staff.email }).from(staff).where(and(eq(staff.role, "admin"), eq(staff.active, true)));
  for (const a of admins) {
    await deps.notifier.email(a.email, "A finished chat hasn't reached the EMR",
      "A finished chat in Vwelfare Connect hasn't been saved to the EMR yet. It stays locked and safe on the platform. Sign in and check \"Chats waiting for the EMR\" on the admin overview.");
  }
  await audit(deps, { type: "system" }, "chat_sync_alert", recordName, { reason });
}

/** Runs every few seconds: reminders, automatic finishes, and retries of queued chats. */
export async function workerTick(deps: Deps) {
  const now = deps.now();
  const rules = await getRules(deps);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  const stale = await deps.db.select().from(chatSessions)
    .where(and(eq(chatSessions.status, "open"), lt(chatSessions.lastMessageAt, hoursAgo(rules.autoFinishHours))));
  for (const s of stale) await finishSession(deps, s, "auto", { type: "system" });

  const remind = await deps.db.select().from(chatSessions)
    .where(and(eq(chatSessions.status, "open"), lt(chatSessions.lastMessageAt, hoursAgo(rules.remindHours)), isNull(chatSessions.remindedAt)));
  for (const s of remind) {
    const p = await deps.db.query.staff.findFirst({ where: eq(staff.id, s.providerId) });
    if (p) await deps.notifier.email(p.email, "An open chat is waiting", `You have an open chat in Vwelfare Connect. It will finish automatically after ${rules.autoFinishHours} hours with no new messages.`);
    await deps.db.update(chatSessions).set({ remindedAt: now }).where(eq(chatSessions.id, s.id));
  }

  const waiting = await deps.db.select({ id: chatSessions.id, recordName: chatSessions.recordName, lastError: chatSessions.lastError }).from(chatSessions)
    .where(and(eq(chatSessions.status, "locked"), isNull(chatSessions.alertedAt), lt(chatSessions.endedAt, new Date(now.getTime() - QUEUE_ALERT_MS))));
  for (const s of waiting) await alertAdmins(deps, s.id, s.recordName, s.lastError ?? "waiting");

  // While the admin has the EMR switched off, nothing is sent; chats stay locked and are picked up once it's back on.
  if (!(await deps.secrets.isEnabled("emr"))) return;
  // Claim each due chat (take the lease) before sending, so two workers or a worker and a request never send it together.
  const due = await deps.db.update(chatSessions)
    .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(chatSessions.status, "locked"), or(isNull(chatSessions.nextAttemptAt), lte(chatSessions.nextAttemptAt, now))))
    .returning({ id: chatSessions.id });
  for (const s of due) await syncSession(deps, s.id);
}
