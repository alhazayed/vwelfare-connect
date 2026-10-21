import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Bilingual } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { useToast } from "../components/ui.tsx";

export function StaffInvite() {
  const { token = "" } = useParams();
  const { t, errText } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ email: string } | null>(null);
  const [err, setErr] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => { api<{ email: string }>("GET", `/api/auth/invite/staff/${encodeURIComponent(token)}`).then(setInfo, e => setErr(errText(e))); }, [token, errText]);

  return (
    <>
      <TopBar />
      <div className="wrap auth"><div className="card auth-card">
        <p className="eyebrow">{t("appName")}</p>
        <h1>{t("staffInviteTitle")}</h1>
        {info && (
          <form className="stack" onSubmit={async e => {
            e.preventDefault();
            if (pw.length < 8 || pw !== pw2) { setErr(t("errPwMatch")); return; }
            try { await api("POST", "/api/auth/staff/accept-invite", { token, password: pw }); toast(t("pwSet")); navigate("/staff"); }
            catch (x) { setErr(errText(x)); }
          }}>
            <p>{t("staffInviteBody", { email: info.email })}</p>
            <label className="fld"><span>{t("password")}</span><input type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /><small className="muted">{t("pwHint")}</small></label>
            <label className="fld"><span>{t("confirmPw")}</span><input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary block">{t("setPassword")}</button>
          </form>
        )}
        {!info && err && <p className="err" role="alert">{err}</p>}
      </div></div>
    </>
  );
}

export function PatientInvite({ onDone }: { onDone: () => Promise<void> }) {
  const { token = "" } = useParams();
  const { t, L, errText } = useI18n();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ invitedBy: Bilingual | null } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ username: "", pw: "", pw2: "", terms: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ invitedBy: Bilingual | null }>("GET", `/api/auth/invite/patient/${encodeURIComponent(token)}`).then(setInfo, e => setLoadErr(errText(e))); }, [token, errText]);

  return (
    <>
      <TopBar />
      <div className="wrap auth"><div className="card auth-card">
        <p className="eyebrow">{t("appName")}</p>
        <h1>{t("inviteTitle")}</h1>
        {loadErr && <p className="err" role="alert">{loadErr}</p>}
        {info && (
          <form className="stack" noValidate onSubmit={async e => {
            e.preventDefault();
            if (f.pw.length < 8 || f.pw !== f.pw2) { setErr(t("errPwMatch")); return; }
            if (!f.terms) { setErr(t("errConsent")); return; }
            setBusy(true); setErr("");
            try {
              await api("POST", "/api/auth/patient/accept-invite", { token, username: f.username, password: f.pw, acceptTerms: true });
              await onDone();
              navigate("/patient", { replace: true });
            } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
          }}>
            <p>{info.invitedBy ? t("inviteBody", { provider: L(info.invitedBy) }) : t("inviteBodyNoName")}</p>
            <label className="fld"><span>{t("username")}</span><input dir="ltr" autoCapitalize="none" autoComplete="username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /><small className="muted">{t("usernameHint")}</small></label>
            <label className="fld"><span>{t("password")}</span><input type="password" dir="ltr" autoComplete="new-password" value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} /><small className="muted">{t("pwHint")}</small></label>
            <label className="fld"><span>{t("confirmPw")}</span><input type="password" dir="ltr" autoComplete="new-password" value={f.pw2} onChange={e => setF({ ...f, pw2: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={f.terms} onChange={e => setF({ ...f, terms: e.target.checked })} /><span>{t("consentText")}</span></label>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy}>{t("createAccount")}</button>
          </form>
        )}
      </div></div>
    </>
  );
}
