import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { Dialog, useAsync, useToast } from "../components/ui.tsx";
import { SecretsPanel } from "./Secrets.tsx";

type ProviderRow = {
  id: string; email: string; nameEn: string; nameAr: string | null; specialtyEn: string | null; specialtyAr: string | null;
  emrStaffId: string | null; active: boolean; mfaEnabled: boolean; hasPassword: boolean; patients: number; openChats: number;
};
type Rules = { remindHours: number; autoFinishHours: number; emergencyNumber: string; crisisLineNumber: string; workingHours: { days: number[]; start: string; end: string } };
type QueueRow = { id: string; recordName: string; finishedBy: string | null; endedAt: string | null; attempts: number; nextAttemptAt: string | null; lastError: string | null };
type AuditRow = { id: number; at: string; actorType: "admin" | "provider" | "patient" | "system"; actorId: string | null; actorName: string | null; action: string; target: string | null; targetName: string | null };

const ACTIONS: Record<string, { en: string; ar: string }> = {
  provider_created: { en: "Created a provider account", ar: "إنشاء حساب مقدم رعاية" },
  provider_deactivated: { en: "Deactivated a provider", ar: "تعطيل حساب مقدم رعاية" },
  provider_reactivated: { en: "Reactivated a provider", ar: "إعادة تفعيل حساب مقدم رعاية" },
  rules_changed: { en: "Changed the chat rules", ar: "تعديل قواعد المحادثة" },
  patient_looked_up: { en: "Looked up a patient in the EMR", ar: "البحث عن مريض في السجل الطبي" },
  patient_linked: { en: "Added an existing patient to their list", ar: "إضافة مريض موجود إلى القائمة" },
  patient_created_and_invited: { en: "Created a patient profile and sent an invitation", ar: "إنشاء ملف مريض وإرسال دعوة" },
  account_created: { en: "Created their account", ar: "إنشاء الحساب" },
  signed_in: { en: "Signed in", ar: "تسجيل الدخول" },
  sign_in_failed: { en: "Failed sign-in attempt", ar: "محاولة دخول فاشلة" },
  chat_started: { en: "Started a chat", ar: "بدء محادثة" },
  chat_finished: { en: "Finished a chat", ar: "إنهاء محادثة" },
  chat_saved_to_emr: { en: "Chat saved to the EMR and deleted from the platform", ar: "حفظ المحادثة في السجل الطبي وحذفها من المنصة" },
  chat_sync_queued: { en: "EMR didn't respond; chat queued", ar: "لم يستجب السجل الطبي؛ وُضعت المحادثة في الانتظار" },
  chat_sync_rejected: { en: "EMR refused a chat; it stays locked", ar: "رفض السجل الطبي محادثة؛ تبقى مقفلة" },
  chat_sync_alert: { en: "Told the admins a chat hasn't reached the EMR", ar: "تنبيه المشرفين بأن محادثة لم تصل إلى السجل الطبي" },
  chat_sync_retry_requested: { en: "Asked to send a waiting chat again", ar: "طلب إعادة إرسال محادثة بالانتظار" },
  risk_words_flagged: { en: "Flagged risk words in a chat", ar: "رصد كلمات خطر في محادثة" },
  consent_requested: { en: "Asked for access to chats with other providers", ar: "طلب إذن قراءة المحادثات مع مقدمي رعاية آخرين" },
  consent_granted: { en: "Allowed access to chats with other providers", ar: "السماح بقراءة المحادثات مع مقدمي رعاية آخرين" },
  consent_declined: { en: "Declined an access request", ar: "رفض طلب وصول" },
  consent_withdrawn: { en: "Withdrew access", ar: "سحب الإذن" },
  record_viewed: { en: "Opened a past chat record", ar: "فتح سجل محادثة سابقة" },
  vault_password_set: { en: "Set the secrets password", ar: "تعيين كلمة مرور الأسرار" },
  vault_password_changed: { en: "Changed the secrets password", ar: "تغيير كلمة مرور الأسرار" },
  vault_password_reset: { en: "Secrets password reset on the server", ar: "إعادة تعيين كلمة مرور الأسرار على الخادم" },
  vault_unlocked: { en: "Opened the secrets list", ar: "فتح قائمة الأسرار" },
  vault_unlock_failed: { en: "Wrong secrets password", ar: "كلمة مرور أسرار خاطئة" },
  vault_locked_out: { en: "Secrets list locked after repeated wrong passwords", ar: "قفل قائمة الأسرار بعد محاولات خاطئة متكررة" },
  secret_added: { en: "Added a secret", ar: "إضافة سر" },
  secret_changed: { en: "Changed a secret", ar: "تعديل سر" },
  secret_revealed: { en: "Viewed a secret", ar: "عرض سر" },
  secret_cleared: { en: "Cleared a saved setting", ar: "مسح إعداد محفوظ" },
  secret_deleted: { en: "Deleted a secret", ar: "حذف سر" },
  emr_connection_tested: { en: "Tested the EMR connection", ar: "اختبار الاتصال بالسجل الطبي" }
};

export function AdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"overview" | "secrets">("overview");
  return (
    <>
      <div className="tabs" role="tablist" style={{ marginBottom: 16, borderBottom: "1px solid var(--line)" }}>
        <button role="tab" type="button" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>{t("adminTabOverview")}</button>
        <button role="tab" type="button" aria-selected={tab === "secrets"} onClick={() => setTab("secrets")}>{t("adminTabSecrets")}</button>
      </div>
      {tab === "overview" ? <Overview /> : <SecretsPanel />}
    </>
  );
}

function Overview() {
  const { t, lang, errText } = useI18n();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const providers = useAsync(() => api<ProviderRow[]>("GET", "/api/admin/providers"), [version]);
  const [adding, setAdding] = useState(false);
  const [deact, setDeact] = useState<ProviderRow | null>(null);
  const name = (p: ProviderRow) => (lang === "ar" && p.nameAr) || p.nameEn;

  return (
    <>
      <div className="screen-head">
        <div><h1>{t("provTitle")}</h1><p className="muted">{t("provSub")}</p></div>
        {!adding && <button className="btn primary" onClick={() => setAdding(true)}>+ {t("addProvider")}</button>}
      </div>
      {adding && <AddProvider onDone={() => { setAdding(false); setVersion(v => v + 1); }} onCancel={() => setAdding(false)} />}
      {providers.error ? <p className="err">{errText(providers.error)}</p> : null}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t("colName")}</th><th>{t("colSpec")}</th><th>{t("colPatients")}</th><th>{t("colOpen")}</th><th>{t("colStatus")}</th><th><span className="vh">{t("deactivate")}</span></th></tr></thead>
          <tbody>
            {(providers.data ?? []).map(p => (
              <tr key={p.id}>
                <td><b>{name(p)}</b><div className="muted small"><span className="mono">{p.email}</span> · <span className="mono">{p.emrStaffId}</span></div></td>
                <td>{(lang === "ar" && p.specialtyAr) || p.specialtyEn}</td>
                <td>{p.patients}</td>
                <td>{p.openChats}</td>
                <td>{!p.active ? <span className="pill">{t("deactivated")}</span> : !p.hasPassword || !p.mfaEnabled ? <span className="pill warn">{t("setupPending")}</span> : <span className="pill ok">{t("active")}</span>}</td>
                <td>{p.active
                  ? <button className="btn small" onClick={() => setDeact(p)}>{t("deactivate")}</button>
                  : <button className="btn small" onClick={async () => { try { await api("POST", `/api/admin/providers/${p.id}/reactivate`); setVersion(v => v + 1); } catch (e) { toast(errText(e), true); } }}>{t("reactivate")}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SyncQueue version={version} />
      <div className="admin-grid">
        <RulesForm />
        <AuditLog version={version} />
      </div>
      {deact && <DeactivateDialog p={deact} name={name(deact)} onClose={() => setDeact(null)} onDone={() => { setDeact(null); setVersion(v => v + 1); }} />}
    </>
  );
}

function SyncQueue({ version }: { version: number }) {
  const { t, fDT, errText } = useI18n();
  const toast = useToast();
  const [mine, setMine] = useState(0);
  const rows = useAsync(() => api<QueueRow[]>("GET", "/api/admin/sync-queue"), [version, mine]);
  // lastError is a short code from the server: "emr_unavailable", or "rejected_<status>_<EMR code>".
  const state = (r: QueueRow) => {
    const refused = r.lastError?.match(/^rejected_(\d+)_(.+)$/);
    if (refused) return <><span className="pill danger">{t("syncRefused")}</span> <span className="mono small">{refused[1]} {refused[2]}</span></>;
    if (r.lastError === "emr_unavailable") return <span className="pill warn">{t("syncWaiting")}</span>;
    if (r.lastError) return <span className="pill warn">{t("syncFailed")}</span>;
    return <span className="pill">{t("syncSending")}</span>;
  };
  const anyRefused = (rows.data ?? []).some(r => r.lastError?.startsWith("rejected_"));
  return (
    <section className="card pad" style={{ marginTop: 16 }}>
      <h2>{t("syncTitle")}</h2>
      <p className="muted small">{t("syncSub")}</p>
      {rows.error ? <p className="err">{errText(rows.error)}</p> : null}
      {rows.data && !rows.data.length && <p className="muted">{t("syncNone")}</p>}
      {!!rows.data?.length && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("colRecord")}</th><th>{t("colFinished")}</th><th>{t("colAttempts")}</th><th>{t("colStatus")}</th><th>{t("colNext")}</th><th><span className="vh">{t("retryNow")}</span></th></tr></thead>
            <tbody>
              {rows.data.map(r => (
                <tr key={r.id}>
                  <td><span className="mono">{r.recordName}</span></td>
                  <td>{r.endedAt ? fDT(r.endedAt) : ""}</td>
                  <td>{r.attempts}</td>
                  <td>{state(r)}</td>
                  <td>{r.nextAttemptAt ? fDT(r.nextAttemptAt) : ""}</td>
                  <td><button className="btn small" onClick={async () => {
                    try { await api("POST", `/api/admin/sync-queue/${r.id}/retry`); toast(t("retryQueued", { rec: r.recordName })); setMine(v => v + 1); }
                    catch (e) { toast(errText(e), true); }
                  }}>{t("retryNow")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {anyRefused && <p className="note warn">{t("syncRefusedHelp")}</p>}
    </section>
  );
}

function AddProvider({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t, errText } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ nameEn: "", nameAr: "", specialtyEn: "", specialtyAr: "", email: "", emrStaffId: "" });
  const [err, setErr] = useState("");
  const field = (k: keyof typeof f, label: string, ltr = false, type = "text") => (
    <label className="fld"><span>{label}</span><input type={type} dir={ltr ? "ltr" : undefined} autoComplete="off" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <form className="card pad stack" style={{ marginBottom: 16 }} onSubmit={async e => {
      e.preventDefault(); setErr("");
      try { await api("POST", "/api/admin/providers", f); toast(t("provInvited", { email: f.email })); onDone(); } catch (x) { setErr(errText(x)); }
    }}>
      <div className="grid3">
        {field("nameEn", t("nameEn"))}{field("nameAr", t("nameAr"))}{field("email", t("email"), true, "email")}
        {field("specialtyEn", t("specEn"))}{field("specialtyAr", t("specAr"))}{field("emrStaffId", t("emrStaffId"), true)}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button type="button" className="btn" onClick={onCancel}>{t("cancel")}</button><button className="btn primary">{t("createProvider")}</button></div>
    </form>
  );
}

function DeactivateDialog({ p, name, onClose, onDone }: { p: ProviderRow; name: string; onClose: () => void; onDone: () => void }) {
  const { t, errText } = useI18n();
  const toast = useToast();
  const impact = useAsync(() => api<{ openChats: number; patients: number }>("GET", `/api/admin/providers/${p.id}/impact`), [p.id]);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={t("deactQ", { name })} onClose={() => { if (!busy) onClose(); }}>
      {impact.data ? <p>{t("deactBody", { name, n: impact.data.openChats, p: impact.data.patients })}</p> : <span className="spin" />}
      <div className="actions">
        <button className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        <button className="btn danger" disabled={busy || !impact.data} onClick={async () => {
          setBusy(true);
          try { const r = await api<{ finishedChats: number }>("POST", `/api/admin/providers/${p.id}/deactivate`); toast(t("deactDone", { name, n: r.finishedChats })); onDone(); }
          catch (e) { toast(errText(e), true); setBusy(false); }
        }}>{t("deactivate")}</button>
      </div>
    </Dialog>
  );
}

function RulesForm() {
  const { t, errText } = useI18n();
  const toast = useToast();
  const loaded = useAsync(() => api<Rules>("GET", "/api/admin/rules"), []);
  const [r, setR] = useState<Rules | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (loaded.data) setR(loaded.data); }, [loaded.data]);
  if (!r) return <section className="card pad"><span className="spin" /></section>;
  const days = t("days").split(",");
  const missing = !r.emergencyNumber || !r.crisisLineNumber;
  return (
    <form className="card pad stack" noValidate onSubmit={async e => {
      e.preventDefault(); setErr("");
      try { setR(await api<Rules>("PUT", "/api/admin/rules", r)); toast(t("rulesSaved")); } catch (x) { setErr(errText(x)); }
    }}>
      <h2>{t("rulesTitle")}</h2>
      <div className="grid2">
        <label className="fld"><span>{t("ruleRemind")}</span><span className="unit"><input type="number" min={1} max={167} value={r.remindHours} onChange={e => setR({ ...r, remindHours: Number(e.target.value) })} /><span className="muted">{t("hoursUnit")}</span></span></label>
        <label className="fld"><span>{t("ruleAuto")}</span><span className="unit"><input type="number" min={2} max={168} value={r.autoFinishHours} onChange={e => setR({ ...r, autoFinishHours: Number(e.target.value) })} /><span className="muted">{t("hoursUnit")}</span></span></label>
      </div>
      <fieldset className="fs">
        <legend>{t("ruleEmergency")}{missing && <span className="pill warn">{t("required")}</span>}</legend>
        <label className="fld"><span>{t("emServices")}</span><input type="tel" dir="ltr" placeholder={t("numberPh")} value={r.emergencyNumber} onChange={e => setR({ ...r, emergencyNumber: e.target.value })} /></label>
        <label className="fld"><span>{t("crisisLine")}</span><input type="tel" dir="ltr" placeholder={t("numberPh")} value={r.crisisLineNumber} onChange={e => setR({ ...r, crisisLineNumber: e.target.value })} /></label>
      </fieldset>
      <fieldset className="fs">
        <legend>{t("workingHours")}</legend>
        <div className="days" role="group" aria-label={t("workingDays")}>
          {days.map((d, i) => (
            <label key={i} className="check"><input type="checkbox" checked={r.workingHours.days.includes(i)}
              onChange={e => setR({ ...r, workingHours: { ...r.workingHours, days: e.target.checked ? [...r.workingHours.days, i].sort() : r.workingHours.days.filter(x => x !== i) } })} /><span>{d}</span></label>
          ))}
        </div>
        <div className="grid2">
          <label className="fld"><span>{t("from")}</span><input type="time" value={r.workingHours.start} onChange={e => setR({ ...r, workingHours: { ...r.workingHours, start: e.target.value } })} /></label>
          <label className="fld"><span>{t("to")}</span><input type="time" value={r.workingHours.end} onChange={e => setR({ ...r, workingHours: { ...r.workingHours, end: e.target.value } })} /></label>
        </div>
      </fieldset>
      <dl className="kv">
        <div><dt>{t("ruleFiles")}</dt><dd>{t("ruleFilesVal")} <span className="muted small">· {t("filesNote")}</span></dd></div>
        <div><dt>{t("ruleKeep")}</dt><dd><b>{t("ruleKeepVal")}</b></dd></div>
      </dl>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button className="btn primary">{t("saveRules")}</button></div>
    </form>
  );
}

function AuditLog({ version }: { version: number }) {
  const { t, lang, fDT, errText } = useI18n();
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(h); }, [q]);
  const rows = useAsync(() => api<AuditRow[]>("GET", `/api/admin/audit?q=${encodeURIComponent(debounced)}&who=${who}`), [debounced, who, version]);
  const actor = (r: AuditRow) => r.actorType === "system" ? t("whoPlatform") : r.actorType === "patient" ? t("patientN", { n: r.actorId ?? "" })
    : r.actorName ?? (r.actorType === "admin" ? t("whoAdmin") : r.actorId ?? "");
  return (
    <section className="card pad">
      <h2>{t("auditTitle")}</h2>
      <p className="muted small">{t("auditSub")}</p>
      <div className="filters">
        <input type="search" value={q} placeholder={t("auditSearch")} aria-label={t("auditSearch")} onChange={e => setQ(e.target.value)} />
        <select value={who} onChange={e => setWho(e.target.value)} aria-label={t("colName")}>
          <option value="all">{t("whoAll")}</option><option value="admin">{t("whoAdmin")}</option><option value="provider">{t("whoProviders")}</option>
          <option value="patient">{t("whoPatients")}</option><option value="system">{t("whoPlatform")}</option>
        </select>
      </div>
      {rows.error ? <p className="err">{errText(rows.error)}</p> : null}
      <ol className="audit">
        {(rows.data ?? []).map(r => (
          <li key={r.id}>
            <time>{fDT(r.at)}</time>
            <div><b>{actor(r)}</b>{ACTIONS[r.action]?.[lang] ?? r.action}{r.target && <> · <span className="mono">{r.targetName ?? r.target}</span></>}</div>
          </li>
        ))}
        {rows.data && !rows.data.length && <li className="muted">{t("auditNone")}</li>}
      </ol>
    </section>
  );
}
