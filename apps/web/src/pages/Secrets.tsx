import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { Dialog, Icon, useAsync, useToast } from "../components/ui.tsx";

type Status = { configured: boolean; unlockedUntil: string | null; lockedUntil: string | null };
type Group = "emr" | "sms" | "email" | "scanner" | "custom";
type Item = {
  name: string; group: Group; known: boolean; connected: boolean; isSecret: boolean;
  source: "saved" | "env" | "none"; value: string | null; description: string | null;
  updatedAt: string | null; updatedByName: string | null;
};

const T = {
  en: {
    title: "API secrets", sub: "Addresses and keys of the services the app connects to. Saved values are encrypted and take the place of the .env file.",
    setupTitle: "Set a secrets password",
    setupBody: "This list is protected by a second password, separate from your sign-in password. Anyone opening it later needs this password. It can't be recovered from the app; if it's lost, IT can reset it on the server.",
    unlockTitle: "Enter the secrets password", unlockBody: "The list stays open for 10 minutes, then locks again.",
    password: "Secrets password", confirm: "Confirm secrets password", pwHint: "At least 12 characters, different from your sign-in password.",
    setup: "Set password and open", unlock: "Open secrets", mismatch: "The passwords don't match.",
    openUntil: "Open until {t}", lockNow: "Lock now", changePw: "Change secrets password",
    current: "Current secrets password", next: "New secrets password", pwChanged: "Secrets password changed",
    g_emr: "EMR connection", g_sms: "SMS provider", g_email: "Email (SMTP)", g_scanner: "Virus scanning", g_custom: "Other secrets",
    gd_emr: "Used now for patient names, visit dates and saving chats.",
    gd_sms: "Saved for later: invitations and alerts still print to the server log.",
    gd_email: "Saved for later: emails still print to the server log.",
    gd_scanner: "Saved for later: uploaded files aren't scanned yet.",
    gd_custom: "Keys you add for other services. Only visible here.",
    colName: "Setting", colValue: "Value", colSource: "Source",
    saved: "Saved here", env: "From .env file", none: "Not set", notConnected: "Not connected yet",
    reveal: "Show", hide: "Hide", copy: "Copy", copied: "Copied", edit: "Edit", clear: "Clear", remove: "Delete", add: "Add secret",
    clearQ: "Clear {name}?", clearBody: "The saved value is removed. The app goes back to the value in the .env file, if there is one.",
    removeQ: "Delete {name}?", removeBody: "The secret is removed for good.",
    editTitle: "Edit {name}", addTitle: "Add a secret", name: "Name", nameHint: "Capital letters, numbers and underscores, e.g. PHARMACY_API_KEY.",
    value: "Value", description: "What it's for", save: "Save", savedToast: "{name} saved", cleared: "{name} cleared",
    showValue: "Show value", updated: "Changed {t} by {who}",
    test: "Test connection", testing: "Testing…", testOk: "Connected: the EMR accepted these credentials.", testFail: "Couldn't connect: {msg}",
    l_EMR_BASE_URL: "API address", l_EMR_CLIENT_ID: "Client ID", l_EMR_CLIENT_SECRET: "Client secret",
    l_SMS_API_URL: "API address", l_SMS_API_KEY: "API key", l_SMS_SENDER_ID: "Sender name",
    l_SMTP_HOST: "Server", l_SMTP_PORT: "Port", l_SMTP_USERNAME: "Username", l_SMTP_PASSWORD: "Password", l_EMAIL_FROM: "Send from address",
    l_MALWARE_SCANNER_URL: "Scanner address", l_MALWARE_SCANNER_API_KEY: "API key",
    err_vault_locked: "The secrets list locked. Enter the password again.", err_bad_vault_password: "The secrets password is incorrect.",
    err_same_as_sign_in: "Use a different password from your sign-in password.", err_bad_name: "Use capital letters, numbers and underscores, starting with a letter.",
    err_bad_url: "Enter a full address starting with http:// or https://", err_bad_port: "Enter a port number.", err_too_long: "That value is too long.",
    err_locked: "Too many attempts. Try again in 15 minutes."
  },
  ar: {
    title: "أسرار واجهات البرمجة", sub: "عناوين ومفاتيح الخدمات التي يتصل بها التطبيق. القيم المحفوظة مشفّرة وتحل محل ملف ‎.env.",
    setupTitle: "عيّن كلمة مرور الأسرار",
    setupBody: "هذه القائمة محمية بكلمة مرور ثانية منفصلة عن كلمة مرور الدخول. يحتاجها كل من يفتح القائمة لاحقاً. لا يمكن استعادتها من التطبيق؛ إذا فُقدت يعيد فريق تقنية المعلومات تعيينها على الخادم.",
    unlockTitle: "أدخل كلمة مرور الأسرار", unlockBody: "تبقى القائمة مفتوحة 10 دقائق ثم تُقفل مجدداً.",
    password: "كلمة مرور الأسرار", confirm: "تأكيد كلمة مرور الأسرار", pwHint: "12 حرفاً على الأقل، ومختلفة عن كلمة مرور الدخول.",
    setup: "تعيين كلمة المرور والفتح", unlock: "فتح الأسرار", mismatch: "كلمتا المرور غير متطابقتين.",
    openUntil: "مفتوحة حتى {t}", lockNow: "قفل الآن", changePw: "تغيير كلمة مرور الأسرار",
    current: "كلمة مرور الأسرار الحالية", next: "كلمة مرور الأسرار الجديدة", pwChanged: "تم تغيير كلمة مرور الأسرار",
    g_emr: "الاتصال بالسجل الطبي", g_sms: "مزوّد الرسائل النصية", g_email: "البريد الإلكتروني (SMTP)", g_scanner: "فحص الفيروسات", g_custom: "أسرار أخرى",
    gd_emr: "مستخدمة الآن لأسماء المرضى وتواريخ الزيارات وحفظ المحادثات.",
    gd_sms: "محفوظة لاحقاً: الدعوات والتنبيهات ما زالت تُطبع في سجل الخادم.",
    gd_email: "محفوظة لاحقاً: الرسائل ما زالت تُطبع في سجل الخادم.",
    gd_scanner: "محفوظة لاحقاً: الملفات المرفوعة لا تُفحص بعد.",
    gd_custom: "مفاتيح تضيفها لخدمات أخرى. تظهر هنا فقط.",
    colName: "الإعداد", colValue: "القيمة", colSource: "المصدر",
    saved: "محفوظة هنا", env: "من ملف ‎.env", none: "غير معيّنة", notConnected: "غير متصلة بعد",
    reveal: "إظهار", hide: "إخفاء", copy: "نسخ", copied: "تم النسخ", edit: "تعديل", clear: "مسح", remove: "حذف", add: "إضافة سر",
    clearQ: "مسح {name}؟", clearBody: "تُحذف القيمة المحفوظة ويعود التطبيق إلى القيمة الموجودة في ملف ‎.env إن وُجدت.",
    removeQ: "حذف {name}؟", removeBody: "يُحذف السر نهائياً.",
    editTitle: "تعديل {name}", addTitle: "إضافة سر", name: "الاسم", nameHint: "أحرف إنجليزية كبيرة وأرقام وشرطات سفلية، مثل PHARMACY_API_KEY.",
    value: "القيمة", description: "الغرض منه", save: "حفظ", savedToast: "تم حفظ {name}", cleared: "تم مسح {name}",
    showValue: "إظهار القيمة", updated: "عُدّلت {t} بواسطة {who}",
    test: "اختبار الاتصال", testing: "جارٍ الاختبار…", testOk: "تم الاتصال: قبِل السجل الطبي بيانات الدخول هذه.", testFail: "تعذّر الاتصال: {msg}",
    l_EMR_BASE_URL: "عنوان الواجهة", l_EMR_CLIENT_ID: "معرّف العميل", l_EMR_CLIENT_SECRET: "سر العميل",
    l_SMS_API_URL: "عنوان الواجهة", l_SMS_API_KEY: "مفتاح الواجهة", l_SMS_SENDER_ID: "اسم المرسل",
    l_SMTP_HOST: "الخادم", l_SMTP_PORT: "المنفذ", l_SMTP_USERNAME: "اسم المستخدم", l_SMTP_PASSWORD: "كلمة المرور", l_EMAIL_FROM: "عنوان المرسل",
    l_MALWARE_SCANNER_URL: "عنوان الفاحص", l_MALWARE_SCANNER_API_KEY: "مفتاح الواجهة",
    err_vault_locked: "أُقفلت قائمة الأسرار. أدخل كلمة المرور مرة أخرى.", err_bad_vault_password: "كلمة مرور الأسرار غير صحيحة.",
    err_same_as_sign_in: "استخدم كلمة مرور مختلفة عن كلمة مرور الدخول.", err_bad_name: "استخدم أحرفاً إنجليزية كبيرة وأرقاماً وشرطات سفلية، تبدأ بحرف.",
    err_bad_url: "أدخل عنواناً كاملاً يبدأ بـ http:// أو https://", err_bad_port: "أدخل رقم المنفذ.", err_too_long: "القيمة طويلة جداً.",
    err_locked: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة."
  }
};
const GROUPS: Group[] = ["emr", "sms", "email", "scanner", "custom"];

function useTx() {
  const i = useI18n();
  const tx = useCallback((k: string, v: Record<string, string | number> = {}) => {
    const d = T[i.lang] as Record<string, string>;
    const s = d[k] ?? (T.en as Record<string, string>)[k] ?? k;
    return s.replace(/\{(\w+)\}/g, (m, x) => (v[x] === undefined ? m : String(v[x])));
  }, [i.lang]);
  const err = useCallback((e: unknown) => {
    const code = (e as ApiError)?.code;
    return code && `err_${code}` in T.en ? tx(`err_${code}`) : i.errText(e);
  }, [tx, i]);
  return { ...i, tx, err };
}

export function SecretsPanel() {
  const { tx } = useTx();
  const status = useAsync(() => api<Status>("GET", "/api/admin/vault"), []);
  const s = status.data;

  // Return to the locked screen when the 10 minutes run out.
  useEffect(() => {
    if (!s?.unlockedUntil) return;
    const ms = new Date(s.unlockedUntil).getTime() - Date.now();
    const h = setTimeout(status.reload, Math.max(0, ms) + 500);
    return () => clearTimeout(h);
  }, [s?.unlockedUntil, status.reload]);

  if (!s) return <div className="empty"><span className="spin" /></div>;
  return (
    <section className="stack">
      <div><h2>{tx("title")}</h2><p className="muted">{tx("sub")}</p></div>
      {!s.configured ? <VaultForm mode="setup" onDone={status.reload} />
        : !s.unlockedUntil ? <VaultForm mode="unlock" onDone={status.reload} />
        : <SecretsList until={s.unlockedUntil} onLocked={status.reload} />}
    </section>
  );
}

function VaultForm({ mode, onDone }: { mode: "setup" | "unlock"; onDone: () => void }) {
  const { tx, err } = useTx();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="card pad stack" style={{ maxWidth: 520 }} onSubmit={async e => {
      e.preventDefault(); setMsg("");
      if (mode === "setup" && pw !== pw2) { setMsg(tx("mismatch")); return; }
      setBusy(true);
      try { await api("POST", `/api/admin/vault/${mode}`, { password: pw }); onDone(); }
      catch (x) { setMsg(err(x)); } finally { setBusy(false); }
    }}>
      <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}>{Icon.lock}{tx(mode === "setup" ? "setupTitle" : "unlockTitle")}</h3>
      <p className="muted">{tx(mode === "setup" ? "setupBody" : "unlockBody")}</p>
      <label className="fld"><span>{tx("password")}</span><input type="password" dir="ltr" autoComplete={mode === "setup" ? "new-password" : "current-password"} value={pw} onChange={e => setPw(e.target.value)} />
        {mode === "setup" && <small className="muted">{tx("pwHint")}</small>}</label>
      {mode === "setup" && <label className="fld"><span>{tx("confirm")}</span><input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>}
      {msg && <p className="err" role="alert">{msg}</p>}
      <div className="actions"><button className="btn primary" disabled={busy || !pw}>{tx(mode === "setup" ? "setup" : "unlock")}</button></div>
    </form>
  );
}

function SecretsList({ until, onLocked }: { until: string; onLocked: () => void }) {
  const { tx, err, t, fTime, fDT } = useTx();
  const toast = useToast();
  const list = useAsync(() => api<Item[]>("GET", "/api/admin/secrets"), []);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; msg?: string } | null>(null);

  const fail = (e: unknown) => {
    if ((e as ApiError)?.code === "vault_locked") { onLocked(); return; }
    toast(err(e), true);
  };
  useEffect(() => { if (list.error) fail(list.error); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [list.error]);

  // Revealed values hide again after 30 seconds.
  useEffect(() => {
    if (!Object.keys(revealed).length) return;
    const h = setTimeout(() => setRevealed({}), 30_000);
    return () => clearTimeout(h);
  }, [revealed]);

  const reveal = async (name: string) => {
    try { const r = await api<{ value: string }>("POST", `/api/admin/secrets/${name}/reveal`); setRevealed(x => ({ ...x, [name]: r.value })); }
    catch (e) { fail(e); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(tx("copied")); } catch { /* clipboard blocked */ }
  };
  const label = (it: Item) => (it.known ? tx(`l_${it.name}`) : it.description || it.name);
  const items = list.data ?? [];

  return (
    <>
      <div className="card pad" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span className="pill ok">{tx("openUntil", { t: fTime(until) })}</span>
        <div className="actions">
          <button className="btn small" onClick={() => setChangingPw(true)}>{tx("changePw")}</button>
          <button className="btn small" onClick={async () => { await api("POST", "/api/admin/vault/lock").catch(() => {}); onLocked(); }}>{Icon.lock}{tx("lockNow")}</button>
        </div>
      </div>

      {GROUPS.map(g => {
        const rows = items.filter(i => i.group === g);
        if (g !== "custom" && !rows.length) return null;
        return (
          <section key={g} className="card pad stack">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><h3>{tx(`g_${g}`)}</h3><p className="muted small">{tx(`gd_${g}`)}</p></div>
              {g === "emr" && (
                <button className="btn small" disabled={test?.busy} onClick={async () => {
                  setTest({ busy: true });
                  try { const r = await api<{ ok: boolean; message?: string }>("POST", "/api/admin/secrets/test/emr"); setTest({ ok: r.ok, msg: r.message }); }
                  catch (e) { setTest(null); fail(e); }
                }}>{test?.busy ? tx("testing") : tx("test")}</button>
              )}
              {g === "custom" && <button className="btn small primary" onClick={() => setEditing("new")}>+ {tx("add")}</button>}
            </div>
            {g === "emr" && test && !test.busy && <p className={`note ${test.ok ? "ok" : "danger"}`} style={{ margin: 0 }}>{test.ok ? tx("testOk") : tx("testFail", { msg: test.msg ?? "" })}</p>}
            {rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{tx("colName")}</th><th>{tx("colValue")}</th><th>{tx("colSource")}</th><th><span className="vh">{tx("edit")}</span></th></tr></thead>
                  <tbody>
                    {rows.map(it => {
                      const shown = it.isSecret ? revealed[it.name] : it.value;
                      return (
                        <tr key={it.name}>
                          <td><b>{label(it)}</b><div className="muted small"><span className="mono">{it.name}</span></div></td>
                          <td style={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                            {it.source === "none" ? <span className="muted">—</span>
                              : shown !== undefined && shown !== null ? <span className="mono">{shown}</span>
                              : <span className="mono muted" aria-label={tx("showValue")}>••••••••••••</span>}
                          </td>
                          <td>
                            <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <span className={`pill${it.source === "saved" ? " ok" : it.source === "none" ? " warn" : ""}`}>{tx(it.source)}</span>
                              {it.known && !it.connected && <span className="pill">{tx("notConnected")}</span>}
                            </span>
                            {it.updatedAt && <div className="muted small">{tx("updated", { t: fDT(it.updatedAt), who: it.updatedByName ?? "" })}</div>}
                          </td>
                          <td>
                            <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "nowrap" }}>
                              {it.isSecret && it.source !== "none" && (revealed[it.name] !== undefined
                                ? <button className="btn small" onClick={() => setRevealed(({ [it.name]: _, ...rest }) => rest)}>{tx("hide")}</button>
                                : <button className="btn small" onClick={() => reveal(it.name)}>{tx("reveal")}</button>)}
                              {shown && <button className="btn small" onClick={() => copy(shown)}>{tx("copy")}</button>}
                              <button className="btn small" onClick={() => setEditing(it)}>{tx("edit")}</button>
                              {it.source === "saved" && <button className="btn small" onClick={() => setConfirming(it)}>{tx(it.known ? "clear" : "remove")}</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {editing && <EditDialog item={editing === "new" ? null : editing} label={editing === "new" ? "" : label(editing)}
        onClose={() => setEditing(null)} onSaved={name => { setEditing(null); setRevealed({}); list.reload(); setTest(null); toast(tx("savedToast", { name })); }} onFail={fail} />}
      {confirming && (
        <Dialog title={tx(confirming.known ? "clearQ" : "removeQ", { name: label(confirming) })} onClose={() => setConfirming(null)}>
          <p>{tx(confirming.known ? "clearBody" : "removeBody")}</p>
          <div className="actions">
            <button className="btn" onClick={() => setConfirming(null)}>{t("cancel")}</button>
            <button className="btn danger" onClick={async () => {
              const it = confirming;
              setConfirming(null);
              try { await api("DELETE", `/api/admin/secrets/${it.name}`); list.reload(); setTest(null); toast(tx("cleared", { name: label(it) })); } catch (e) { fail(e); }
            }}>{tx(confirming.known ? "clear" : "remove")}</button>
          </div>
        </Dialog>
      )}
      {changingPw && <ChangePasswordDialog onClose={() => setChangingPw(false)} onFail={fail} />}
    </>
  );
}

function EditDialog({ item, label, onClose, onSaved, onFail }: {
  item: Item | null; label: string; onClose: () => void; onSaved: (name: string) => void; onFail: (e: unknown) => void;
}) {
  const { tx, err, t } = useTx();
  const [name, setName] = useState(item?.name ?? "");
  const [value, setValue] = useState(item && !item.isSecret ? item.value ?? "" : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const secret = item ? item.isSecret : true;
  return (
    <Dialog title={item ? tx("editTitle", { name: label }) : tx("addTitle")} onClose={onClose}>
      <form className="stack" onSubmit={async e => {
        e.preventDefault(); setMsg("");
        try {
          await api("PUT", `/api/admin/secrets/${encodeURIComponent(name.trim())}`, { value, ...(item?.known ? {} : { description }) });
          onSaved(item ? label : name.trim());
        } catch (x) {
          if ((x as ApiError)?.code === "vault_locked") { onFail(x); return; }
          setMsg(err(x));
        }
      }}>
        {!item && <label className="fld"><span>{tx("name")}</span><input dir="ltr" className="mono" autoComplete="off" value={name} onChange={e => setName(e.target.value.toUpperCase())} /><small className="muted">{tx("nameHint")}</small></label>}
        {item && <p className="muted small"><span className="mono">{item.name}</span></p>}
        <label className="fld"><span>{tx("value")}</span>
          <input dir="ltr" autoComplete="off" spellCheck={false} type={secret && !show ? "password" : "text"} value={value} onChange={e => setValue(e.target.value)} />
        </label>
        {secret && <label className="check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /><span>{tx("showValue")}</span></label>}
        {!item?.known && <label className="fld"><span>{tx("description")}</span><input autoComplete="off" value={description} onChange={e => setDescription(e.target.value)} /></label>}
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" disabled={!value.trim() || !name.trim()}>{tx("save")}</button></div>
      </form>
    </Dialog>
  );
}

function ChangePasswordDialog({ onClose, onFail }: { onClose: () => void; onFail: (e: unknown) => void }) {
  const { tx, err, t } = useTx();
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <Dialog title={tx("changePw")} onClose={onClose}>
      <form className="stack" onSubmit={async e => {
        e.preventDefault(); setMsg("");
        if (next !== next2) { setMsg(tx("mismatch")); return; }
        try { await api("POST", "/api/admin/vault/password", { current: cur, next }); toast(tx("pwChanged")); onClose(); }
        catch (x) { if ((x as ApiError)?.code === "vault_locked") { onFail(x); return; } setMsg(err(x)); }
      }}>
        <label className="fld"><span>{tx("current")}</span><input type="password" dir="ltr" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label className="fld"><span>{tx("next")}</span><input type="password" dir="ltr" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /><small className="muted">{tx("pwHint")}</small></label>
        <label className="fld"><span>{tx("confirm")}</span><input type="password" dir="ltr" autoComplete="new-password" value={next2} onChange={e => setNext2(e.target.value)} /></label>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" disabled={!cur || !next}>{tx("save")}</button></div>
      </form>
    </Dialog>
  );
}
