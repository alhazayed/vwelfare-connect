import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { HelpButton, HelpDialog } from "../components/chat.tsx";

export function StaffLogin({ onDone }: { onDone: () => Promise<void> }) {
  const { t, errText } = useI18n();
  const [step, setStep] = useState<"password" | "mfa" | "mfa-setup">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step === "mfa-setup") api<{ secret: string; qrDataUrl: string }>("GET", "/api/auth/staff/mfa-setup").then(setSetup, e => setErr(errText(e)));
  }, [step, errText]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <TopBar />
      <div className="wrap auth">
        <div className="card auth-card">
          <p className="eyebrow">{t("appName")}</p>
          {step === "password" ? (
            <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => {
              const r = await api<{ next: "mfa" | "mfa-setup" }>("POST", "/api/auth/staff/login", { email, password });
              setStep(r.next);
            }); }}>
              <h1>{t("staffSignIn")}</h1>
              <label className="fld"><span>{t("email")}</span><input type="email" dir="ltr" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
              <label className="fld"><span>{t("password")}</span><input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
              {err && <p className="err" role="alert">{err}</p>}
              <button className="btn primary block" disabled={busy}>{t("signIn")}</button>
              <Link className="small muted" to="/">{t("patientLink")}</Link>
            </form>
          ) : (
            <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => {
              try { await api("POST", "/api/auth/staff/mfa", { code }); }
              catch (e) {
                // Too many wrong codes: the account is locked and signed out, so start again from the password.
                if (e instanceof ApiError && e.code === "locked") { setCode(""); setStep("password"); }
                throw e;
              }
              await onDone();
            }); }}>
              <h1>{t(step === "mfa" ? "mfaTitle" : "mfaSetupTitle")}</h1>
              <p>{t(step === "mfa" ? "mfaBody" : "mfaSetupBody")}</p>
              {step === "mfa-setup" && setup && (
                <>
                  <img className="qr" src={setup.qrDataUrl} alt="" />
                  <p className="small muted">{t("mfaManual")} <span className="mono">{setup.secret}</span></p>
                </>
              )}
              <label className="fld"><span>{t("code")}</span><input inputMode="numeric" autoComplete="one-time-code" dir="ltr" pattern="\d{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required /></label>
              {err && <p className="err" role="alert">{err}</p>}
              <button className="btn primary block" disabled={busy || code.length !== 6}>{t("verify")}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export function PatientLogin({ onDone }: { onDone: () => Promise<void> }) {
  const { t, errText } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<{ emergencyNumber: string; crisisLineNumber: string } | null>(null);

  return (
    <>
      <TopBar />
      <div className="wrap auth">
        <div className="card auth-card">
          <p className="eyebrow">{t("appName")}</p>
          <form className="stack" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setErr("");
            try { await api("POST", "/api/auth/patient/login", { username, password }); await onDone(); }
            catch (x) { setErr(errText(x)); } finally { setBusy(false); }
          }}>
            <h1>{t("patientSignIn")}</h1>
            <label className="fld"><span>{t("username")}</span><input dir="ltr" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} required /></label>
            <label className="fld"><span>{t("password")}</span><input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy}>{t("signIn")}</button>
            <p className="muted small">{t("forgotPatient")}</p>
          </form>
          <HelpButton onClick={() => api<{ emergencyNumber: string; crisisLineNumber: string }>("GET", "/api/public/help").then(setHelp, () => setHelp({ emergencyNumber: "", crisisLineNumber: "" }))} />
          <Link className="small muted" to="/staff">{t("staffLink")}</Link>
        </div>
      </div>
      {help && <HelpDialog help={help} onClose={() => setHelp(null)} />}
    </>
  );
}
