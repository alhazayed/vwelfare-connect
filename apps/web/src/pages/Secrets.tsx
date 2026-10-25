import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { Dialog, Icon, useAsync, useToast } from "../components/ui.tsx";

type Status = { configured: boolean; unlockedUntil: string | null; lockedUntil: string | null };
type Group = "emr" | "sms" | "email" | "scanner" | "custom";
type Item = {
  name: string; group: Group; known: boolean; connected: boolean; isSecret: boolean;
  source: "saved" | "env" | "none"; value: string | null; description: string | null;
  updatedAt: string | null; updatedByName: string | null; service: string;
};
type Service = {
  id: string; builtIn: boolean; connected: boolean; name: string | null; description: string | null; address: string | null;
  enabled: boolean; updatedAt: string | null; updatedByName: string | null; waiting?: number;
};
type TestState = { busy?: boolean; ok?: boolean; result?: string; status?: number; message?: string };

const T = {
  en: {
    title: "APIs and services", sub: "The outside services the app connects to. Switch each one on or off, test it, and keep its addresses and keys here. Saved values are encrypted and take the place of the .env file.",
    setupTitle: "Set a secrets password",
    setupBody: "This list is protected by a second password, separate from your sign-in password. Anyone opening it later needs this password. It can't be recovered from the app; if it's lost, IT can reset it on the server.",
    unlockTitle: "Enter the secrets password", unlockBody: "The list stays open for 10 minutes, then locks again.",
    password: "Secrets password", confirm: "Confirm secrets password", pwHint: "At least 12 characters, different from your sign-in password.",
    setup: "Set password and open", unlock: "Open secrets", mismatch: "The passwords don't match.",
    openUntil: "Open until {t}", lockNow: "Lock now", changePw: "Change secrets password",
    current: "Current secrets password", next: "New secrets password", pwChanged: "Secrets password changed",
    g_emr: "EMR connection", g_sms: "SMS provider", g_email: "Email (Resend)", g_scanner: "Virus scanning", g_custom: "Other secrets",
    gd_emr: "Used now for patient names, visit dates and saving chats.",
    gd_sms: "Saved for later: invitations and alerts still print to the server log.",
    gd_email: "Used now for staff invitations, sign-in resets, risk alerts and reminders. Until the key and send-from address are saved, emails print to the server log with addresses masked.",
    offEmailBody: "While it's off, no emails go out: staff invitations, sign-in resets, risk alerts and reminders only print to the server log, with addresses masked.",
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
    test: "Test connection", testing: "Testing…",
    l_EMR_BASE_URL: "API address", l_EMR_CLIENT_ID: "Client ID", l_EMR_CLIENT_SECRET: "Client secret",
    l_SMS_API_URL: "API address", l_SMS_API_KEY: "API key", l_SMS_SENDER_ID: "Sender name",
    l_RESEND_API_KEY: "Resend API key", l_EMAIL_FROM: "Send from address (on a domain verified in Resend)",
    l_MALWARE_SCANNER_URL: "Scanner address", l_MALWARE_SCANNER_API_KEY: "API key",
    err_vault_locked: "The secrets list locked. Enter the password again.", err_bad_vault_password: "The secrets password is incorrect.",
    err_same_as_sign_in: "Use a different password from your sign-in password.", err_bad_name: "Use capital letters, numbers and underscores, starting with a letter.",
    err_bad_url: "Enter a full address starting with http:// or https://", err_bad_port: "Enter a port number.", err_too_long: "That value is too long.",
    err_emr_host_not_allowed: "This EMR address isn't on the server's allowed list. Ask the hosting team to add its host to EMR_ALLOWED_HOSTS first.",
    err_emr_https_required: "The EMR address must start with https:// on the live system.",
    err_vault_exists: "The secrets password is already set. Reload the page to unlock the list.",
    err_vault_not_set: "Set the secrets password first.",
    err_locked: "Too many attempts. Try again in 15 minutes.",
    err_service_not_found: "That service no longer exists. Reload the page.",
    err_built_in_service: "The app's own services can't be renamed or deleted, only switched off.",
    gd_added: "Added by an admin. The app doesn't call it yet: its settings are kept here for when it's connected.",
    on: "On", off: "Off", turnOff: "Turn off", useService: "Use {name}",
    addService: "Add service", addServiceTitle: "Add a service", editService: "Edit service", editServiceTitle: "Edit {name}", deleteService: "Delete service",
    serviceName: "Name", serviceAddress: "Address to test (optional)", serviceAddressHint: "Used only by Test connection, for example https://api.partner.example/health. Don't put keys in it: add them as secrets below the service.",
    addSecretHere: "Add secret", noSettings: "No secrets saved for this service yet.",
    serviceSaved: "{name} saved", serviceDeleted: "{name} deleted", turnedOn: "{name} turned on", turnedOff: "{name} turned off",
    deleteServiceQ: "Delete {name}?", deleteServiceBody: "The service and the {n} secrets saved under it are removed for good.",
    offQ: "Turn off {name}?",
    offEmrBody: "While it's off, nothing is sent to or read from the EMR. Providers can't look up patients or open past chats, and patients can't open past chats. Chats that finish stay locked on the platform and are sent once it's turned back on. Every admin gets an email.",
    offPlannedBody: "This service isn't connected yet, so turning it off changes nothing today. It will be respected once the connection is built.",
    offAddedBody: "The app doesn't call this service yet. The switch is kept with its settings.",
    emrOff: "The EMR connection is off. {n} finished chats are waiting and will be sent when it's turned back on.",
    emrWaiting: "{n} finished chats are waiting to be saved to the EMR.",
    probe_emr_ok: "Connected: the EMR accepted these credentials.",
    probe_emr_failed: "Couldn't connect: {msg}",
    probe_reachable: "Something answered at this address (code {status}). Only the address was checked; no key or password was sent.",
    probe_server_error: "The address answered with a server error (code {status}).",
    probe_not_set: "Save the address first.",
    probe_bad_address: "The saved address isn't valid.",
    probe_blocked_address: "This address points inside the server's own network, so it isn't tested.",
    probe_unreachable: "Nothing answered at this address.",
    probe_timeout: "The address didn't answer within 8 seconds.",
    probe_email_sent: "A test email was sent to your sign-in address. Check your inbox.",
    probe_email_failed: "Resend refused the email (code {status}). Check the API key, and that the send-from address uses a domain verified in Resend.",
    probe_email_not_set: "Save the Resend API key and the send-from address first."
  },
  ar: {
    title: "الواجهات والخدمات", sub: "الخدمات الخارجية التي يتصل بها التطبيق. يمكن تشغيل كل خدمة أو إيقافها واختبارها وحفظ عناوينها ومفاتيحها هنا. القيم المحفوظة مشفّرة وتحل محل ملف ‎.env.",
    setupTitle: "عيّن كلمة مرور الأسرار",
    setupBody: "هذه القائمة محمية بكلمة مرور ثانية منفصلة عن كلمة مرور الدخول. يحتاجها كل من يفتح القائمة لاحقاً. لا يمكن استعادتها من التطبيق؛ إذا فُقدت يعيد فريق تقنية المعلومات تعيينها على الخادم.",
    unlockTitle: "أدخل كلمة مرور الأسرار", unlockBody: "تبقى القائمة مفتوحة 10 دقائق ثم تُقفل مجدداً.",
    password: "كلمة مرور الأسرار", confirm: "تأكيد كلمة مرور الأسرار", pwHint: "12 حرفاً على الأقل، ومختلفة عن كلمة مرور الدخول.",
    setup: "تعيين كلمة المرور والفتح", unlock: "فتح الأسرار", mismatch: "كلمتا المرور غير متطابقتين.",
    openUntil: "مفتوحة حتى {t}", lockNow: "قفل الآن", changePw: "تغيير كلمة مرور الأسرار",
    current: "كلمة مرور الأسرار الحالية", next: "كلمة مرور الأسرار الجديدة", pwChanged: "تم تغيير كلمة مرور الأسرار",
    g_emr: "الاتصال بالسجل الطبي", g_sms: "مزوّد الرسائل النصية", g_email: "البريد الإلكتروني (Resend)", g_scanner: "فحص الفيروسات", g_custom: "أسرار أخرى",
    gd_emr: "مستخدمة الآن لأسماء المرضى وتواريخ الزيارات وحفظ المحادثات.",
    gd_sms: "محفوظة لاحقاً: الدعوات والتنبيهات ما زالت تُطبع في سجل الخادم.",
    gd_email: "مستخدمة الآن لدعوات الموظفين وإعادة ضبط الدخول وتنبيهات الخطر والتذكيرات. إلى أن يُحفظ المفتاح وعنوان المرسل، تُطبع الرسائل في سجل الخادم مع إخفاء العناوين.",
    offEmailBody: "أثناء الإيقاف لا تُرسل أي رسائل بريد: دعوات الموظفين وإعادة ضبط الدخول وتنبيهات الخطر والتذكيرات تُطبع فقط في سجل الخادم مع إخفاء العناوين.",
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
    test: "اختبار الاتصال", testing: "جارٍ الاختبار…",
    l_EMR_BASE_URL: "عنوان الواجهة", l_EMR_CLIENT_ID: "معرّف العميل", l_EMR_CLIENT_SECRET: "سر العميل",
    l_SMS_API_URL: "عنوان الواجهة", l_SMS_API_KEY: "مفتاح الواجهة", l_SMS_SENDER_ID: "اسم المرسل",
    l_RESEND_API_KEY: "مفتاح Resend API", l_EMAIL_FROM: "عنوان المرسل (على نطاق موثّق في Resend)",
    l_MALWARE_SCANNER_URL: "عنوان الفاحص", l_MALWARE_SCANNER_API_KEY: "مفتاح الواجهة",
    err_vault_locked: "أُقفلت قائمة الأسرار. أدخل كلمة المرور مرة أخرى.", err_bad_vault_password: "كلمة مرور الأسرار غير صحيحة.",
    err_same_as_sign_in: "استخدم كلمة مرور مختلفة عن كلمة مرور الدخول.", err_bad_name: "استخدم أحرفاً إنجليزية كبيرة وأرقاماً وشرطات سفلية، تبدأ بحرف.",
    err_bad_url: "أدخل عنواناً كاملاً يبدأ بـ http:// أو https://", err_bad_port: "أدخل رقم المنفذ.", err_too_long: "القيمة طويلة جداً.",
    err_emr_host_not_allowed: "عنوان السجل الطبي هذا ليس في القائمة المسموح بها على الخادم. يجب أن يضيف فريق الاستضافة اسم الخادم إلى EMR_ALLOWED_HOSTS أولاً.",
    err_emr_https_required: "يجب أن يبدأ عنوان السجل الطبي بـ https:// في النظام الفعلي.",
    err_vault_exists: "كلمة مرور الأسرار مُعيّنة بالفعل. يُرجى إعادة تحميل الصفحة لفتح القائمة.",
    err_vault_not_set: "يُرجى تعيين كلمة مرور الأسرار أولاً.",
    err_locked: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.",
    err_service_not_found: "هذه الخدمة لم تعد موجودة. يُرجى إعادة تحميل الصفحة.",
    err_built_in_service: "لا يمكن إعادة تسمية خدمات التطبيق الأساسية أو حذفها، يمكن إيقافها فقط.",
    gd_added: "أضافها مشرف. لا يستدعيها التطبيق بعد: إعداداتها محفوظة هنا لحين ربطها.",
    on: "تعمل", off: "متوقفة", turnOff: "إيقاف", useService: "استخدام {name}",
    addService: "إضافة خدمة", addServiceTitle: "إضافة خدمة", editService: "تعديل الخدمة", editServiceTitle: "تعديل {name}", deleteService: "حذف الخدمة",
    serviceName: "الاسم", serviceAddress: "عنوان للاختبار (اختياري)", serviceAddressHint: "يُستخدم فقط في اختبار الاتصال، مثل https://api.partner.example/health. لا تضع فيه مفاتيح: أضفها كأسرار تحت الخدمة.",
    addSecretHere: "إضافة سر", noSettings: "لا توجد أسرار محفوظة لهذه الخدمة بعد.",
    serviceSaved: "تم حفظ {name}", serviceDeleted: "تم حذف {name}", turnedOn: "تم تشغيل {name}", turnedOff: "تم إيقاف {name}",
    deleteServiceQ: "حذف {name}؟", deleteServiceBody: "تُحذف الخدمة والأسرار المحفوظة تحتها ({n}) نهائياً.",
    offQ: "إيقاف {name}؟",
    offEmrBody: "أثناء الإيقاف لا يُرسل شيء إلى السجل الطبي ولا يُقرأ منه شيء. لا يمكن لمقدمي الرعاية البحث عن المرضى أو فتح المحادثات السابقة، ولا يمكن للمرضى فتح المحادثات السابقة. المحادثات المنتهية تبقى مقفلة على المنصة وتُرسل عند إعادة التشغيل. يصل بريد إلكتروني إلى كل المشرفين.",
    offPlannedBody: "هذه الخدمة غير متصلة بعد، لذلك لا يغيّر إيقافها شيئاً الآن. سيُطبَّق الإيقاف عند بناء الاتصال.",
    offAddedBody: "لا يستدعي التطبيق هذه الخدمة بعد. تُحفظ حالة التشغيل مع إعداداتها.",
    emrOff: "الاتصال بالسجل الطبي متوقف. توجد {n} محادثات منتهية بالانتظار وستُرسل عند إعادة التشغيل.",
    emrWaiting: "توجد {n} محادثات منتهية بانتظار حفظها في السجل الطبي.",
    probe_emr_ok: "تم الاتصال: قبِل السجل الطبي بيانات الدخول هذه.",
    probe_emr_failed: "تعذّر الاتصال: {msg}",
    probe_reachable: "استجاب شيء على هذا العنوان (الرمز {status}). فُحص العنوان فقط ولم يُرسل أي مفتاح أو كلمة مرور.",
    probe_server_error: "استجاب العنوان بخطأ في الخادم (الرمز {status}).",
    probe_not_set: "احفظ العنوان أولاً.",
    probe_bad_address: "العنوان المحفوظ غير صالح.",
    probe_blocked_address: "هذا العنوان داخل شبكة الخادم نفسه، لذلك لا يُختبر.",
    probe_unreachable: "لم يستجب شيء على هذا العنوان.",
    probe_timeout: "لم يستجب العنوان خلال 8 ثوانٍ.",
    probe_email_sent: "أُرسلت رسالة تجريبية إلى بريد الدخول الخاص بك. تحقّق من صندوق الوارد.",
    probe_email_failed: "رفض Resend الرسالة (الرمز {status}). تحقّق من مفتاح API، ومن أن عنوان المرسل على نطاق موثّق في Resend.",
    probe_email_not_set: "احفظ مفتاح Resend API وعنوان المرسل أولاً."
  }
};

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
  const svcs = useAsync(() => api<Service[]>("GET", "/api/admin/services"), []);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ item: Item | null; service?: string } | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [editingService, setEditingService] = useState<Service | "new" | null>(null);
  const [turningOff, setTurningOff] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const fail = (e: unknown) => {
    if ((e as ApiError)?.code === "vault_locked") { onLocked(); return; }
    toast(err(e), true);
  };
  useEffect(() => { if (list.error) fail(list.error); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [list.error]);
  useEffect(() => { if (svcs.error) fail(svcs.error); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [svcs.error]);

  // Revealed values hide again after 30 seconds.
  useEffect(() => {
    if (!Object.keys(revealed).length) return;
    const h = setTimeout(() => setRevealed({}), 30_000);
    return () => clearTimeout(h);
  }, [revealed]);

  const reload = () => { list.reload(); svcs.reload(); setTests({}); };
  const reveal = async (name: string) => {
    try { const r = await api<{ value: string }>("POST", `/api/admin/secrets/${name}/reveal`); setRevealed(x => ({ ...x, [name]: r.value })); }
    catch (e) { fail(e); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(tx("copied")); } catch { /* clipboard blocked */ }
  };
  const runTest = async (s: Service) => {
    setTests(x => ({ ...x, [s.id]: { busy: true } }));
    try { const r = await api<TestState>("POST", `/api/admin/services/${s.id}/test`); setTests(x => ({ ...x, [s.id]: r })); }
    catch (e) { setTests(({ [s.id]: _, ...rest }) => rest); fail(e); }
  };
  const setEnabled = async (s: Service, enabled: boolean) => {
    try {
      await api("POST", `/api/admin/services/${s.id}/enabled`, { enabled });
      svcs.reload();
      toast(tx(enabled ? "turnedOn" : "turnedOff", { name: serviceLabel(s) }));
    } catch (e) { fail(e); }
  };
  const label = (it: Item) => (it.known ? tx(`l_${it.name}`) : it.description || it.name);
  const serviceLabel = (s: Service) => (s.builtIn ? tx(`g_${s.id}`) : s.name ?? s.id);
  const items = list.data ?? [];
  const services = svcs.data ?? [];
  const loose: Service = { id: "custom", builtIn: true, connected: false, name: null, description: null, address: null, enabled: true, updatedAt: null, updatedByName: null };

  const table = (rows: Item[]) => (
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
                  <span className={`pill${it.source === "saved" ? " ok" : it.source === "none" ? " warn" : ""}`}>{tx(it.source)}</span>
                  {it.updatedAt && <div className="muted small">{tx("updated", { t: fDT(it.updatedAt), who: it.updatedByName ?? "" })}</div>}
                </td>
                <td>
                  <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "nowrap" }}>
                    {it.isSecret && it.source !== "none" && (revealed[it.name] !== undefined
                      ? <button className="btn small" onClick={() => setRevealed(({ [it.name]: _, ...rest }) => rest)}>{tx("hide")}</button>
                      : <button className="btn small" onClick={() => reveal(it.name)}>{tx("reveal")}</button>)}
                    {shown && <button className="btn small" onClick={() => copy(shown)}>{tx("copy")}</button>}
                    <button className="btn small" onClick={() => setEditing({ item: it })}>{tx("edit")}</button>
                    {it.source === "saved" && <button className="btn small" onClick={() => setConfirming(it)}>{tx(it.known ? "clear" : "remove")}</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const testNote = (s: Service) => {
    const r = tests[s.id];
    if (!r || r.busy) return null;
    return <p className={`note ${r.ok ? "ok" : "danger"}`} style={{ margin: 0 }} role="status">{tx(`probe_${r.result}`, { status: r.status ?? "", msg: r.message ?? "" })}</p>;
  };

  return (
    <>
      <div className="card pad" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span className="pill ok">{tx("openUntil", { t: fTime(until) })}</span>
        <div className="actions">
          <button className="btn small primary" onClick={() => setEditingService("new")}>+ {tx("addService")}</button>
          <button className="btn small" onClick={() => setChangingPw(true)}>{tx("changePw")}</button>
          <button className="btn small" onClick={async () => { await api("POST", "/api/admin/vault/lock").catch(() => {}); onLocked(); }}>{Icon.lock}{tx("lockNow")}</button>
        </div>
      </div>

      {[...services, loose].map(s => {
        const rows = items.filter(i => i.service === s.id);
        const custom = s.id === "custom";
        const name = serviceLabel(s);
        return (
          <section key={s.id} className="card pad stack" aria-label={name}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <h3 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {name}
                  {!custom && <span className={`pill${s.enabled ? " ok" : " warn"}`}>{tx(s.enabled ? "on" : "off")}</span>}
                  {s.builtIn && !custom && !s.connected && <span className="pill">{tx("notConnected")}</span>}
                </h3>
                <p className="muted small">{s.builtIn ? tx(`gd_${s.id}`) : s.description || tx("gd_added")}</p>
                {!s.builtIn && s.address && <p className="muted small"><span className="mono">{s.address}</span></p>}
                {s.updatedAt && <p className="muted small">{tx("updated", { t: fDT(s.updatedAt), who: s.updatedByName ?? "" })}</p>}
              </div>
              <div className="actions" style={{ flexWrap: "wrap" }}>
                {!custom && (
                  <button type="button" role="switch" className="switch" aria-checked={s.enabled} aria-label={tx("useService", { name })}
                    onClick={() => (s.enabled ? setTurningOff(s) : setEnabled(s, true))}>
                    <span className="track" aria-hidden="true" />{tx(s.enabled ? "on" : "off")}
                  </button>
                )}
                {!custom && <button className="btn small" disabled={tests[s.id]?.busy} onClick={() => runTest(s)}>{tests[s.id]?.busy ? tx("testing") : tx("test")}</button>}
                {(custom || !s.builtIn) && <button className="btn small" onClick={() => setEditing({ item: null, service: custom ? undefined : s.id })}>+ {tx("addSecretHere")}</button>}
                {!s.builtIn && <button className="btn small" onClick={() => setEditingService(s)}>{tx("editService")}</button>}
                {!s.builtIn && <button className="btn small" onClick={() => setDeletingService(s)}>{tx("deleteService")}</button>}
              </div>
            </div>
            {s.id === "emr" && (s.waiting ?? 0) > 0 && (
              <p className={`note ${s.enabled ? "" : "warn"}`} style={{ margin: 0 }}>{tx(s.enabled ? "emrWaiting" : "emrOff", { n: s.waiting ?? 0 })}</p>
            )}
            {testNote(s)}
            {rows.length > 0 ? table(rows) : !s.builtIn && <p className="muted small">{tx("noSettings")}</p>}
          </section>
        );
      })}

      {editing && <EditDialog item={editing.item} service={editing.service} label={editing.item ? label(editing.item) : ""}
        onClose={() => setEditing(null)} onSaved={name => { setEditing(null); setRevealed({}); reload(); toast(tx("savedToast", { name })); }} onFail={fail} />}
      {confirming && (
        <Dialog title={tx(confirming.known ? "clearQ" : "removeQ", { name: label(confirming) })} onClose={() => setConfirming(null)}>
          <p>{tx(confirming.known ? "clearBody" : "removeBody")}</p>
          <div className="actions">
            <button className="btn" onClick={() => setConfirming(null)}>{t("cancel")}</button>
            <button className="btn danger" onClick={async () => {
              const it = confirming;
              setConfirming(null);
              try { await api("DELETE", `/api/admin/secrets/${it.name}`); reload(); toast(tx("cleared", { name: label(it) })); } catch (e) { fail(e); }
            }}>{tx(confirming.known ? "clear" : "remove")}</button>
          </div>
        </Dialog>
      )}
      {turningOff && (
        <Dialog title={tx("offQ", { name: serviceLabel(turningOff) })} onClose={() => setTurningOff(null)}>
          <p>{tx(turningOff.id === "emr" ? "offEmrBody" : turningOff.id === "email" ? "offEmailBody" : turningOff.builtIn ? "offPlannedBody" : "offAddedBody")}</p>
          <div className="actions">
            <button className="btn" onClick={() => setTurningOff(null)}>{t("cancel")}</button>
            <button className="btn danger" onClick={() => { const s = turningOff; setTurningOff(null); setEnabled(s, false); }}>{tx("turnOff")}</button>
          </div>
        </Dialog>
      )}
      {deletingService && (
        <Dialog title={tx("deleteServiceQ", { name: serviceLabel(deletingService) })} onClose={() => setDeletingService(null)}>
          <p>{tx("deleteServiceBody", { n: items.filter(i => i.service === deletingService.id).length })}</p>
          <div className="actions">
            <button className="btn" onClick={() => setDeletingService(null)}>{t("cancel")}</button>
            <button className="btn danger" onClick={async () => {
              const s = deletingService;
              setDeletingService(null);
              try { await api("DELETE", `/api/admin/services/${s.id}`); reload(); toast(tx("serviceDeleted", { name: serviceLabel(s) })); } catch (e) { fail(e); }
            }}>{tx("deleteService")}</button>
          </div>
        </Dialog>
      )}
      {editingService && <ServiceDialog service={editingService === "new" ? null : editingService} onClose={() => setEditingService(null)}
        onSaved={name => { setEditingService(null); reload(); toast(tx("serviceSaved", { name })); }} onFail={fail} />}
      {changingPw && <ChangePasswordDialog onClose={() => setChangingPw(false)} onFail={fail} />}
    </>
  );
}

function ServiceDialog({ service, onClose, onSaved, onFail }: {
  service: Service | null; onClose: () => void; onSaved: (name: string) => void; onFail: (e: unknown) => void;
}) {
  const { tx, err, t } = useTx();
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [address, setAddress] = useState(service?.address ?? "");
  const [msg, setMsg] = useState("");
  return (
    <Dialog title={service ? tx("editServiceTitle", { name: service.name ?? "" }) : tx("addServiceTitle")} onClose={onClose}>
      <form className="stack" onSubmit={async e => {
        e.preventDefault(); setMsg("");
        const body = { name: name.trim(), description: description.trim(), ...(address.trim() ? { address: address.trim() } : {}) };
        try {
          await api(service ? "PUT" : "POST", service ? `/api/admin/services/${service.id}` : "/api/admin/services", body);
          onSaved(body.name);
        } catch (x) {
          if ((x as ApiError)?.code === "vault_locked") { onFail(x); return; }
          setMsg(err(x));
        }
      }}>
        <label className="fld"><span>{tx("serviceName")}</span><input dir="auto" autoComplete="off" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="fld"><span>{tx("description")}</span><input dir="auto" autoComplete="off" maxLength={300} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="fld"><span>{tx("serviceAddress")}</span><input dir="ltr" className="mono" type="url" autoComplete="off" spellCheck={false} value={address} onChange={e => setAddress(e.target.value)} />
          <small className="muted">{tx("serviceAddressHint")}</small></label>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" disabled={!name.trim()}>{tx("save")}</button></div>
      </form>
    </Dialog>
  );
}

function EditDialog({ item, service, label, onClose, onSaved, onFail }: {
  item: Item | null; service?: string; label: string; onClose: () => void; onSaved: (name: string) => void; onFail: (e: unknown) => void;
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
          await api("PUT", `/api/admin/secrets/${encodeURIComponent(name.trim())}`, { value, ...(item?.known ? {} : { description }), ...(!item && service ? { service } : {}) });
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
