import { useCallback, useEffect, useState } from "react";
import { api, useLive, type Bilingual, type ChatSession, type Me, type RecordSummary } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { Dialog, Icon, Tabs, useAsync, useToast } from "../components/ui.tsx";
import { Composer, RecordViewer, Thread, fileForm, useAwayBlur } from "../components/chat.tsx";

type PatientRow = { fileNumber: string; status: "invited" | "active" | "deactivated"; name: Bilingual | null; openChat: boolean; lastFrom: string | null; risk: boolean; waitingForEmr: boolean };
type Detail = { fileNumber: string; status: string; name: Bilingual | null; visits: string[]; invitedTo: string | null };
type ChatState = { open: ChatSession | null; waitingForEmr: boolean; autoFinishHours: number };
type Records = { mine: RecordSummary[]; others: RecordSummary[]; consent: "pending" | "granted" | "denied" | "withdrawn" | null };

export function ProviderPage({ me }: { me: Extract<Me, { kind: "staff" }> }) {
  const { t, L, errText } = useI18n();
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "pane">("list");
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const list = useAsync(() => api<PatientRow[]>("GET", "/api/provider/patients"), [version]);
  useAwayBlur();
  useLive(() => setVersion(v => v + 1));

  const patients = list.data ?? [];
  useEffect(() => { if (!sel && patients.length) setSel(patients[0]!.fileNumber); }, [patients, sel]);

  const open = (f: string) => { setSel(f); setView("pane"); };

  return (
    <>
      <div className="screen-head">
        <div><h1>{t("myPatients")}</h1><p className="muted">{L(me.name)} · {L(me.specialty)}</p></div>
        <button type="button" className="btn" onClick={() => setAdding(true)}>+ {t("addPatient")}</button>
      </div>
      {list.error ? <p className="err">{errText(list.error)}</p> : null}
      <div className="split" data-view={view}>
        <aside className="card list">
          <ul>
            {patients.map(p => (
              <li key={p.fileNumber}>
                <button type="button" className={`pt${p.fileNumber === sel ? " on" : ""}`} aria-current={p.fileNumber === sel} onClick={() => open(p.fileNumber)}>
                  <span className="pt-name">{p.name ? L(p.name) : "—"}</span>
                  <span className="pt-meta">
                    <span className="mono">{p.fileNumber}</span>
                    {p.status === "invited" && <span className="pill warn">{t("awaiting")}</span>}
                    {p.waitingForEmr && <span className="pill warn">{t("waitSync")}</span>}
                    {p.risk && <span className="pill danger">{t("riskPill")}</span>}
                    {p.openChat && (p.lastFrom === "patient" ? <span className="pill new">{t("newMsg")}</span> : <span className="pill ok">{t("chatOpen")}</span>)}
                  </span>
                </button>
              </li>
            ))}
            {!list.loading && !patients.length && <li className="empty">{t("noPatients")}</li>}
          </ul>
        </aside>
        <section className="card pane">
          {sel ? <PatientPane key={sel} file={sel} me={me} version={version} onBack={() => setView("list")} onChanged={() => setVersion(v => v + 1)} />
            : <div className="empty">{t("pickPatient")}</div>}
        </section>
      </div>
      {adding && <AddPatientDialog onClose={() => setAdding(false)} onOpen={f => { setAdding(false); setVersion(v => v + 1); open(f); }} />}
    </>
  );
}

function PatientPane({ file, me, version, onBack, onChanged }: { file: string; me: Extract<Me, { kind: "staff" }>; version: number; onBack: () => void; onChanged: () => void }) {
  const { t, L, fDate, errText } = useI18n();
  const [tab, setTab] = useState<"current" | "past">("current");
  const detail = useAsync(() => api<Detail>("GET", `/api/provider/patients/${file}`), [file]);
  const d = detail.data;
  const name = d?.name ? L(d.name) : file;
  return (
    <>
      <header className="pane-head">
        <div className="pane-top">
          <button type="button" className="icon-btn back" onClick={onBack} aria-label={t("back")}>{Icon.back}</button>
          <div className="who"><h2>{name}</h2><span className="muted">{t("fileLabel", { n: "" })}<span className="mono">{file}</span></span></div>
        </div>
        {d && d.visits.length > 0 && (
          <div className="visits"><span className="muted small">{t("visits")}</span><ul className="chips">{d.visits.map(v => <li key={v}>{fDate(v)}</li>)}</ul></div>
        )}
        <Tabs value={tab} onChange={setTab} />
      </header>
      <div className="pane-body">
        {detail.error ? <div className="empty"><p>{errText(detail.error)}</p><button className="btn" onClick={detail.reload}>{t("retry")}</button></div>
          : !d ? <div className="empty"><span className="spin" /></div>
          : d.status === "invited" ? <div className="empty">{t("invitedNote", { name, mobile: d.invitedTo ?? "" })}</div>
          : tab === "current" ? <CurrentChat file={file} patientName={name} me={me} version={version} onChanged={onChanged} />
          : <PastChats file={file} patientName={name} me={me} version={version} />}
      </div>
    </>
  );
}

function CurrentChat({ file, patientName, me, version, onChanged }: { file: string; patientName: string; me: Extract<Me, { kind: "staff" }>; version: number; onChanged: () => void }) {
  const { t, L, fDT, fDur, errText } = useI18n();
  const toast = useToast();
  const chat = useAsync(() => api<ChatState>("GET", `/api/provider/patients/${file}/chat`), [file, version]);
  // Holds the chat being finished, so the dialog survives the live reload that follows the save.
  const [finishing, setFinishing] = useState<ChatSession | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(i); }, []);
  const base = `/api/provider/patients/${file}/chat`;
  const c = chat.data;
  if (chat.error) return <div className="empty"><p>{errText(chat.error)}</p><button className="btn" onClick={chat.reload}>{t("retry")}</button></div>;
  if (!c) return <div className="empty"><span className="spin" /></div>;
  const s = c.open;
  return (
    <>
      {c.waitingForEmr && <p className="note warn">{t("lockedNote")}</p>}
      {s ? (
        <>
          <div className="sess-bar">
            <p className="muted small">{t("started", { t: fDT(s.startedAt) })} · {t("autoIn", { d: fDur(new Date(s.lastMessageAt).getTime() + c.autoFinishHours * 3600_000 - Date.now()) })}</p>
            <button type="button" className="btn primary" onClick={() => setFinishing(s)}>{Icon.lock}{t("finishChat")}</button>
          </div>
          {s.risk && <p className="note danger">{Icon.alert}<span>{t("riskNote")}</span></p>}
          <Thread session={s} viewer="provider" patientName={patientName} providerName={L(me.name)} />
          <Composer role="provider" placeholder={t("typeMsg")}
            onText={async text => { await api("POST", `${base}/messages`, { text }); chat.reload(); onChanged(); }}
            onFile={async f => { await api("POST", `${base}/files`, fileForm(f)); chat.reload(); }} />
        </>
      ) : (
        <div className="empty">
          <p>{t("noOpenProv", { name: patientName })}</p>
          <button type="button" className="btn primary" onClick={async () => { try { await api("POST", base); chat.reload(); onChanged(); } catch (e) { toast(errText(e), true); } }}>{t("startChat")}</button>
        </div>
      )}
      {finishing && <FinishDialog file={file} session={finishing} onClose={() => { setFinishing(null); chat.reload(); onChanged(); }} />}
    </>
  );
}

function FinishDialog({ file, session, onClose }: { file: string; session: ChatSession; onClose: () => void }) {
  const { t, errText } = useI18n();
  const [state, setState] = useState<"confirm" | "busy" | "saved" | "queued">("confirm");
  const [err, setErr] = useState("");
  const close = useCallback(() => { if (state !== "busy") onClose(); }, [state, onClose]);
  const go = async () => {
    setState("busy"); setErr("");
    try { const r = await api<{ status: "saved" | "queued" }>("POST", `/api/provider/patients/${file}/chat/finish`); setState(r.status); }
    catch (e) { setErr(errText(e)); setState("confirm"); }
  };
  return (
    <Dialog title={t(state === "confirm" || state === "busy" ? "finishQ" : "finishChat")} onClose={close}>
      {state === "confirm" && <>
        <p>{t("finishBody", { file, rec: session.recordName })}</p>
        {err && <p className="err">{err}</p>}
        <div className="actions"><button className="btn" onClick={close}>{t("keepChatting")}</button><button className="btn primary" onClick={go}>{Icon.lock}{t("finishGo")}</button></div>
      </>}
      {state === "busy" && <p className="lock-note"><span className="spin" />{t("finishing")}</p>}
      {state === "saved" && <><p className="note ok">{t("finishedSaved", { rec: session.recordName })}</p><div className="actions"><button className="btn primary" onClick={close}>{t("close")}</button></div></>}
      {state === "queued" && <><p className="note warn">{t("finishedQueued")}</p><div className="actions"><button className="btn primary" onClick={close}>{t("close")}</button></div></>}
    </Dialog>
  );
}

function PastChats({ file, patientName, me, version }: { file: string; patientName: string; me: Extract<Me, { kind: "staff" }>; version: number }) {
  const { t, L, fDT, errText } = useI18n();
  const toast = useToast();
  const recs = useAsync(() => api<Records>("GET", `/api/provider/patients/${file}/records`), [file, version]);
  const [viewing, setViewing] = useState<string | null>(null);
  if (recs.error) return <div className="empty"><p>{errText(recs.error)}</p><button className="btn" onClick={recs.reload}>{t("retry")}</button></div>;
  if (!recs.data) return <div className="empty"><span className="spin" />{t("loading")}</div>;
  const r = recs.data;
  const ask = async () => { try { await api("POST", `/api/provider/patients/${file}/consent-request`); recs.reload(); } catch (e) { toast(errText(e), true); } };
  const row = (x: RecordSummary, canView: boolean, showProvider: boolean) => (
    <li key={x.recordId}>
      <div className="rec-main">
        <span className="rec-when">{fDT(x.startedAt)}</span>
        <span className="muted small">{showProvider && <>{L(x.providerName ?? null)} · </>}{t("msgsFiles", { m: x.messageCount, f: x.attachmentCount })} · <span className="mono">{x.recordName}</span></span>
      </div>
      {canView ? <button className="btn small" onClick={() => setViewing(x.recordId)}>{t("view")}</button> : <span className="locked" title={t("askConsent")}>{Icon.lock}</span>}
    </li>
  );
  return (
    <div className="past">
      <h3>{t("pastMine", { name: patientName })}</h3>
      {r.mine.length ? <ul className="recs">{r.mine.map(x => row(x, true, false))}</ul> : <p className="muted">{t("noPast")}</p>}
      {r.others.length > 0 && <>
        <h3>{t("pastOthers")}</h3>
        <div className="consent-row">
          {r.consent === "granted" ? <p className="note ok">{t("consentGranted")}</p>
            : r.consent === "pending" ? <p className="note">{t("consentPending")}</p>
            : r.consent === "denied" ? <><p className="note warn">{t("consentDenied")}</p><button className="btn small" onClick={ask}>{t("askAgain")}</button></>
            : r.consent === "withdrawn" ? <><p className="note warn">{t("consentWithdrawn")}</p><button className="btn small" onClick={ask}>{t("askAgain")}</button></>
            : <><p className="muted">{t("othersLocked", { name: patientName })}</p><button className="btn small" onClick={ask}>{Icon.lock}{t("askConsent")}</button></>}
        </div>
        <ul className="recs">{r.others.map(x => row(x, r.consent === "granted", true))}</ul>
      </>}
      {viewing && <RecordViewer recordId={viewing} base="/api/provider/records" viewer="provider" viewerName={L(me.name)} patientName={patientName} onClose={() => setViewing(null)} />}
    </div>
  );
}

function AddPatientDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (file: string) => void }) {
  const { t, L, fDate, errText, lang } = useI18n();
  const toast = useToast();
  const [file, setFile] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<{ fileNumber: string; name: Bilingual; visits: string[]; onPlatform: boolean; mine: boolean } | null>(null);

  const lookup = async () => {
    setBusy(true); setErr(""); setFound(null);
    try { setFound(await api("POST", "/api/provider/lookup", { fileNumber: file.trim() })); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const create = async () => {
    if (!found) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ status: "linked" | "invited" }>("POST", "/api/provider/patients", { fileNumber: found.fileNumber, mobile: found.onPlatform ? undefined : mobile });
      toast(t(r.status === "invited" ? "patientInvited" : "patientLinked", { name: L(found.name) }));
      onOpen(found.fileNumber);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog title={t("addPatientTitle")} sub={t("addPatientSub")} onClose={onClose}>
      <form className="row-form" onSubmit={e => { e.preventDefault(); void lookup(); }}>
        <label className="fld grow"><span>{t("fileNo")}</span><input inputMode="numeric" dir="ltr" autoComplete="off" value={file} onChange={e => setFile(e.target.value)} /></label>
        <button className="btn" disabled={busy || !file.trim()}>{busy && !found ? <span className="spin" /> : null}{t("lookup")}</button>
      </form>
      {found && <>
        <div className="emr-box">
          <div className="emr-tag">{t("fromEmr")}</div>
          <dl className="kv">
            <div><dt>{t("name")}</dt><dd>{L(found.name)}</dd></div>
            <div><dt>{t("visitDates")}</dt><dd>{found.visits.map(v => fDate(v)).join(lang === "ar" ? "، " : ", ")}</dd></div>
          </dl>
        </div>
        {found.mine ? <><p className="note">{t("alreadyMine", { name: L(found.name) })}</p><div className="actions"><button className="btn primary" onClick={() => onOpen(found.fileNumber)}>{t("openPatient")}</button></div></>
          : found.onPlatform ? <><p className="note">{t("alreadyOnPlatform", { name: L(found.name) })}</p><div className="actions"><button className="btn primary" disabled={busy} onClick={create}>{t("linkPatient")}</button></div></>
          : <form className="stack" onSubmit={e => { e.preventDefault(); void create(); }}>
              <label className="fld"><span>{t("mobileLabel")}</span><input type="tel" dir="ltr" autoComplete="off" value={mobile} onChange={e => setMobile(e.target.value)} /><small className="muted">{t("mobileHint")}</small></label>
              <div className="actions"><button className="btn primary" disabled={busy}>{t("createPatient")}</button></div>
            </form>}
      </>}
      {err && <p className="err" role="alert">{err}</p>}
    </Dialog>
  );
}
