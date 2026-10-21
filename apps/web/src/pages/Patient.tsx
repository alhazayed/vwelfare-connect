import { useEffect, useState } from "react";
import { api, useLive, type Bilingual, type ChatSession, type RecordSummary } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { Icon, Tabs, useAsync, useToast } from "../components/ui.tsx";
import { Composer, HelpButton, HelpDialog, HelpNumbers, RecordViewer, Thread, fileForm, useAwayBlur } from "../components/chat.tsx";

type Help = { emergencyNumber: string; crisisLineNumber: string };
type MeData = {
  fileNumber: string; username: string; name: Bilingual | null; afterHours: boolean; help: Help;
  team: Array<{ id: string; name: Bilingual; specialty: Bilingual; openChat: boolean }>;
  consents: Array<{ providerId: string; status: "pending" | "granted" | "denied" | "withdrawn" }>;
};

export function PatientPage() {
  const { t, L, errText } = useI18n();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const me = useAsync(() => api<MeData>("GET", "/api/patient/me"), [version]);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "pane">("list");
  const [help, setHelp] = useState(false);
  useAwayBlur();
  useLive(() => setVersion(v => v + 1));

  const d = me.data;
  useEffect(() => { if (d && (!sel || !d.team.some(p => p.id === sel))) setSel(d.team[0]?.id ?? null); }, [d, sel]);
  if (me.error) return <div className="empty"><p>{errText(me.error)}</p><button className="btn" onClick={me.reload}>{t("retry")}</button></div>;
  if (!d) return <div className="empty"><span className="spin" /></div>;

  const firstName = d.name ? L(d.name).split(" ")[0] : d.username;
  const nameOf = (id: string) => L(d.team.find(p => p.id === id)?.name ?? null);
  const answer = async (pid: string, a: "granted" | "denied" | "withdraw") => {
    try {
      if (a === "withdraw") await api("DELETE", `/api/patient/consents/${pid}`);
      else await api("POST", `/api/patient/consents/${pid}`, { answer: a });
      me.reload();
    } catch (e) { toast(errText(e), true); }
  };
  const provider = d.team.find(p => p.id === sel);

  return (
    <>
      <div className="screen-head">
        <div><h1>{t("hello", { name: firstName ?? "" })}</h1><p className="muted">{d.username} · {t("fileLabel", { n: "" })}<span className="mono">{d.fileNumber}</span></p></div>
        <div className="head-actions"><HelpButton onClick={() => setHelp(true)} /></div>
      </div>

      {d.consents.filter(c => c.status === "pending").map(c => (
        <div key={c.providerId} className="card req">
          <div><h3>{t("reqTitle")}</h3><p>{t("reqBody", { provider: nameOf(c.providerId) })}</p></div>
          <div className="actions">
            <button className="btn" onClick={() => answer(c.providerId, "denied")}>{t("decline")}</button>
            <button className="btn primary" onClick={() => answer(c.providerId, "granted")}>{t("allow")}</button>
          </div>
        </div>
      ))}
      {d.consents.some(c => c.status === "granted") && (
        <div className="grants">
          {d.consents.filter(c => c.status === "granted").map(c => (
            <div key={c.providerId} className="grant"><span>{t("granted", { provider: nameOf(c.providerId) })}</span><button className="btn small" onClick={() => answer(c.providerId, "withdraw")}>{t("withdraw")}</button></div>
          ))}
        </div>
      )}

      <div className="split" data-view={view}>
        <aside className="card list">
          <h2 className="list-h">{t("careTeam")}</h2>
          <ul>
            {d.team.map(p => (
              <li key={p.id}>
                <button type="button" className={`pt${p.id === sel ? " on" : ""}`} aria-current={p.id === sel} onClick={() => { setSel(p.id); setView("pane"); }}>
                  <span className="pt-name">{L(p.name)}</span>
                  <span className="pt-meta"><span>{L(p.specialty)}</span>{p.openChat && <span className="pill ok">{t("chatOpen")}</span>}</span>
                </button>
              </li>
            ))}
            {!d.team.length && <li className="empty">{t("noTeam")}</li>}
          </ul>
        </aside>
        <section className="card pane">
          {provider ? (
            <ProviderPane key={provider.id} providerId={provider.id} providerName={L(provider.name)} specialty={L(provider.specialty)}
              patientName={d.name ? L(d.name) : d.username} viewerName={`${d.name ? L(d.name) : d.username} · ${d.fileNumber}`}
              afterHours={d.afterHours} help={d.help} version={version} onBack={() => setView("list")} onHelp={() => setHelp(true)} onChanged={me.reload} />
          ) : <div className="empty">{t("noTeam")}</div>}
        </section>
      </div>
      {help && <HelpDialog help={d.help} onClose={() => setHelp(false)} />}
    </>
  );
}

function ProviderPane(p: {
  providerId: string; providerName: string; specialty: string; patientName: string; viewerName: string;
  afterHours: boolean; help: Help; version: number; onBack: () => void; onHelp: () => void; onChanged: () => void;
}) {
  const { t, fDT, errText } = useI18n();
  const [tab, setTab] = useState<"current" | "past">("current");
  const base = `/api/patient/providers/${p.providerId}`;
  const chat = useAsync(() => api<{ open: ChatSession | null }>("GET", `${base}/chat`), [p.providerId, p.version]);
  const past = useAsync(() => (tab === "past" ? api<RecordSummary[]>("GET", `${base}/records`) : Promise.resolve(null)), [p.providerId, tab, p.version]);
  const [viewing, setViewing] = useState<string | null>(null);
  const s = chat.data?.open ?? null;

  return (
    <>
      <header className="pane-head">
        <div className="pane-top">
          <button type="button" className="icon-btn back" onClick={p.onBack} aria-label={t("back")}>{Icon.back}</button>
          <div className="who"><h2>{p.providerName}</h2><span className="muted">{p.specialty}</span></div>
          <HelpButton short onClick={p.onHelp} />
        </div>
        <Tabs value={tab} onChange={setTab} />
      </header>
      <div className="pane-body">
        {tab === "current" ? (
          chat.error ? <div className="empty"><p>{errText(chat.error)}</p><button className="btn" onClick={chat.reload}>{t("retry")}</button></div> : <>
            {s?.risk ? <Urgent title={t("riskTitle")} body={t("riskBody")} help={p.help} />
              : p.afterHours ? <Urgent title={t("afterHoursTitle")} body={t("afterHoursBody")} help={p.help} /> : null}
            {s ? <Thread session={s} viewer="patient" patientName={p.patientName} providerName={p.providerName} />
              : <div className="empty">{chat.loading ? <span className="spin" /> : t("newConvHint", { name: p.providerName })}</div>}
            <Composer role="patient" placeholder={t("writeTo", { name: p.providerName })}
              onText={async text => { await api("POST", `${base}/chat/messages`, { text }); chat.reload(); p.onChanged(); }}
              onFile={async f => { await api("POST", `${base}/chat/files`, fileForm(f)); chat.reload(); p.onChanged(); }} />
          </>
        ) : (
          <div className="past">
            <h3>{t("pastWith", { name: p.providerName })}</h3>
            {past.error ? <p className="err">{errText(past.error)}</p>
              : !past.data ? <div className="empty"><span className="spin" />{t("loading")}</div>
              : past.data.length ? (
                <ul className="recs">
                  {past.data.map(r => (
                    <li key={r.recordId}>
                      <div className="rec-main"><span className="rec-when">{fDT(r.startedAt)}</span><span className="muted small">{t("msgsFiles", { m: r.messageCount, f: r.attachmentCount })}</span></div>
                      <button className="btn small" onClick={() => setViewing(r.recordId)}>{t("view")}</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t("noPast")}</p>}
          </div>
        )}
      </div>
      {viewing && <RecordViewer recordId={viewing} base="/api/patient/records" viewer="patient" viewerName={p.viewerName} patientName={p.patientName} onClose={() => setViewing(null)} />}
    </>
  );
}

function Urgent({ title, body, help }: { title: string; body: string; help: Help }) {
  return <div className="urgent" role="alert"><b>{title}</b><p>{body}</p><HelpNumbers help={help} /></div>;
}
