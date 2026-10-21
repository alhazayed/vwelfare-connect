import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n.tsx";

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  file: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  clip: svg(<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />),
  lock: svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  alert: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>),
  phone: svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />),
  back: svg(<path d="M15 6l-6 6 6 6" />),
  x: svg(<path d="M6 6l12 12M18 6L6 18" />)
};

export function Dialog({ title, sub, wide, onClose, children }: { title: ReactNode; sub?: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,textarea,button.primary,button.danger,.icon-btn")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        <header className="dlg-head">
          <div><h2 id="dlg-t">{title}</h2>{sub && <p className="muted small">{sub}</p>}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("close")}>{Icon.x}</button>
        </header>
        <div className="dlg-body">{children}</div>
      </div>
    </div>
  );
}

type Toast = { text: string; bad?: boolean; id: number };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback((text: string, bad?: boolean) => {
    const id = Date.now();
    setToast({ text, bad, id });
    setTimeout(() => setToast(cur => (cur?.id === id ? null : cur)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host" aria-live="polite">{toast && <div className={`toast${toast.bad ? " bad" : ""}`} role="status">{toast.text}</div>}</div>
    </ToastCtx.Provider>
  );
}

export function Tabs({ value, onChange }: { value: "current" | "past"; onChange: (v: "current" | "past") => void }) {
  const { t } = useI18n();
  return (
    <div className="tabs" role="tablist">
      {(["current", "past"] as const).map(k => (
        <button key={k} role="tab" type="button" aria-selected={value === k} onClick={() => onChange(k)}>{t(k === "current" ? "tabCurrent" : "tabPast")}</button>
      ))}
    </div>
  );
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    load().then(data => { if (live) setState({ data, loading: false }); }, error => { if (live) setState({ error, loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick(x => x + 1), []) };
}
