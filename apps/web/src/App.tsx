import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, type Me } from "./api.ts";
import { useI18n } from "./i18n.tsx";
import { PatientLogin, StaffLogin } from "./pages/SignIn.tsx";
import { PatientInvite, StaffInvite } from "./pages/Invite.tsx";
import { ProviderPage } from "./pages/Provider.tsx";
import { PatientPage } from "./pages/Patient.tsx";
import { AdminPage } from "./pages/Admin.tsx";
import { TopBar } from "./components/TopBar.tsx";

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("GET", "/api/auth/me")); } catch { setMe(null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Any 401 (for example after the idle timeout) returns to the right sign-in screen.
  useEffect(() => {
    const onOut = () => setMe(cur => {
      navigate(cur?.kind === "staff" ? "/staff" : "/", { replace: true });
      return null;
    });
    window.addEventListener("vw:signed-out", onOut);
    return () => window.removeEventListener("vw:signed-out", onOut);
  }, [navigate]);

  const signOut = useCallback(async () => {
    const wasStaff = me?.kind === "staff";
    await api("POST", "/api/auth/logout").catch(() => {});
    setMe(null);
    navigate(wasStaff ? "/staff" : "/", { replace: true });
  }, [me, navigate]);

  if (me === undefined) return null;
  const home = !me ? null : me.kind === "patient" ? "/patient" : !me.mfaOk ? null : me.role === "admin" ? "/admin" : "/provider";

  return (
    <Routes>
      <Route path="/invite/staff/:token?" element={<StaffInvite />} />
      <Route path="/invite/patient/:token?" element={<PatientInvite onDone={refresh} />} />
      <Route path="/staff" element={home ? <Navigate to={home} replace /> : <StaffLogin onDone={refresh} />} />
      <Route path="/" element={home ? <Navigate to={home} replace /> : <PatientLogin onDone={refresh} />} />
      <Route path="/admin" element={me?.kind === "staff" && me.mfaOk && me.role === "admin" ? <Shell me={me} onSignOut={signOut}><AdminPage /></Shell> : <Navigate to="/staff" replace />} />
      <Route path="/provider" element={me?.kind === "staff" && me.mfaOk && me.role === "provider" ? <Shell me={me} onSignOut={signOut}><ProviderPage me={me} /></Shell> : <Navigate to="/staff" replace />} />
      <Route path="/patient" element={me?.kind === "patient" ? <Shell me={me} onSignOut={signOut}><PatientPage /></Shell> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Shell({ me, onSignOut, children }: { me: Me; onSignOut: () => void; children: ReactNode }) {
  const { t, L } = useI18n();
  return (
    <>
      <TopBar>
        <span className="who-am-i">{me.kind === "staff" ? L(me.name) : me.username}</span>
        <button type="button" className="btn" onClick={onSignOut}>{t("signOut")}</button>
      </TopBar>
      <main className="wrap page">{children}</main>
    </>
  );
}
