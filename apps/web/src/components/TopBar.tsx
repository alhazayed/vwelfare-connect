import type { ReactNode } from "react";
import { useI18n } from "../i18n.tsx";

export function TopBar({ children }: { children?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <span className="brand"><img src="/icon.svg" alt="" />{t("appName")}</span>
        {children}
        <button type="button" className="btn" lang={lang === "en" ? "ar" : "en"} onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t("langBtn")}</button>
      </div>
    </header>
  );
}
