import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ChatMessage, type ChatSession, type RecordView } from "../api.ts";
import { useI18n, type Bilingual } from "../i18n.tsx";
import { Dialog, Icon, useToast } from "./ui.tsx";

type Viewer = "patient" | "provider";

export function Thread({ session, viewer, patientName, providerName }: { session: ChatSession; viewer: Viewer; patientName: string; providerName: string }) {
  const { t, fDT, fTime, fSize } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [session.messages.length]);
  return (
    <div className="thread" role="log" ref={ref}>
      {session.messages.map(m => <Message key={m.id} m={m} viewer={viewer} startedBy={session.startedBy} patientName={patientName} providerName={providerName} t={t} fDT={fDT} fTime={fTime} fSize={fSize} />)}
    </div>
  );
}

function Message({ m, viewer, startedBy, patientName, providerName, t, fDT, fTime, fSize }: {
  m: ChatMessage; viewer: Viewer; startedBy: Viewer; patientName: string; providerName: string;
} & Pick<ReturnType<typeof useI18n>, "t" | "fDT" | "fTime" | "fSize">) {
  if (m.kind === "afterhours") return <div className="sys warn">{t("autoReply")}</div>;
  if (m.kind === "started") return <div className="sys">{t("convStarted", { name: startedBy === "patient" ? patientName : providerName })} · {fDT(m.sentAt)}</div>;
  const mine = m.sender === viewer;
  const risk = m.risk && viewer === "provider";
  const a = m.attachment;
  return (
    <div className={`msg${mine ? " mine" : ""}${risk ? " risk" : ""}`}>
      <div className="bubble">
        {a ? (
          <div className="file">
            {a.mimeType.startsWith("image/") && <img src={`/api/chat-files/${a.id}`} alt="" />}
            <div className="file-row">{Icon.file}<a className="fname" href={`/api/chat-files/${a.id}`} target="_blank" rel="noreferrer">{a.fileName}</a><span className="muted small">{fSize(a.sizeBytes)}</span></div>
          </div>
        ) : m.text}
      </div>
      <div className="meta">
        {mine ? t("you") : m.sender === "patient" ? patientName : providerName} · {fTime(m.sentAt)}{mine && ` · ${t("sent")} ✓`}
        {risk && <> · <span className="pill danger">{t("riskPill")}</span></>}
      </div>
    </div>
  );
}

export function Composer({ role, placeholder, onText, onFile }: { role: Viewer; placeholder: string; onText: (text: string) => Promise<void>; onFile: (f: File) => Promise<void> }) {
  const { t, errText } = useI18n();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try { await onText(v); setText(""); } catch (e) { toast(errText(e), true); } finally { setBusy(false); }
  };
  return (
    <div className="composer-wrap">
      <p className="composer-note">{t(role === "patient" ? "composerNotePt" : "composerNotePv")}</p>
      <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        <label className="attach" title={t("attach")}>
          {Icon.clip}<span className="vh">{t("attach")}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.m4a" onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) { toast(t("err_FST_REQ_FILE_TOO_LARGE"), true); return; }
            try { await onFile(f); } catch (err) { toast(errText(err), true); }
          }} />
        </label>
        <textarea rows={1} value={text} placeholder={placeholder} aria-label={placeholder} maxLength={4000}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <button className="btn primary send" type="submit" disabled={busy}>{t("send")}</button>
      </form>
    </div>
  );
}

export const fileForm = (f: File) => { const fd = new FormData(); fd.append("file", f); return fd; };

export function HelpNumbers({ help }: { help: { emergencyNumber: string; crisisLineNumber: string } }) {
  const { t } = useI18n();
  const rows = [["emServices", help.emergencyNumber], ["crisisLine", help.crisisLineNumber]] as const;
  return (
    <ul className="help-list">
      {rows.map(([k, num]) => (
        <li key={k}>
          <div><b>{t(k)}</b>{num ? <span className="mono help-num">{num}</span> : <span className="muted small">{t("numberMissing")}</span>}</div>
          {num && <a className="btn primary call" href={`tel:${num.replace(/\s/g, "")}`}>{Icon.phone}{t("call")}</a>}
        </li>
      ))}
    </ul>
  );
}

export function HelpButton({ short, onClick }: { short?: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className={`btn help${short ? " small" : ""}`} onClick={onClick}>
      {Icon.phone}<span className={short ? "help-short" : undefined}>{t(short ? "urgentShort" : "urgentHelp")}</span>
    </button>
  );
}

export function HelpDialog({ help, onClose }: { help: { emergencyNumber: string; crisisLineNumber: string }; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog title={t("helpTitle")} onClose={onClose}>
      <p>{t("helpBody")}</p>
      <HelpNumbers help={help} />
      <p className="muted small">{t("callHint")}</p>
    </Dialog>
  );
}

function watermark(text: string) {
  const col = getComputedStyle(document.documentElement).getPropertyValue("--wm").trim() || "#7F8C86";
  const esc = text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="170"><text x="170" y="90" text-anchor="middle" transform="rotate(-22 170 85)" fill="${col}" fill-opacity="0.28" font-family="sans-serif" font-size="13">${esc}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/** Read-only view of a past chat, streamed from the EMR and never stored. */
export function RecordViewer({ recordId, base, viewer, viewerName, patientName, onClose }: {
  recordId: string; base: "/api/provider/records" | "/api/patient/records"; viewer: Viewer; viewerName: string; patientName: string; onClose: () => void;
}) {
  const { t, L, fDT, fTime, fSize, errText } = useI18n();
  const [rec, setRec] = useState<RecordView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [openedAt] = useState(() => new Date());

  useEffect(() => {
    let urls: string[] = [];
    api<RecordView>("GET", `${base}/${encodeURIComponent(recordId)}`).then(async r => {
      setRec(r);
      for (const a of r.attachments.filter(a => a.mimeType.startsWith("image/"))) {
        const res = await fetch(`${base}/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(a.id)}`, { credentials: "same-origin" });
        if (res.ok) { const u = URL.createObjectURL(await res.blob()); urls.push(u); setImages(x => ({ ...x, [a.id]: u })); }
      }
    }, e => setErr(errText(e)));
    const block = (e: Event) => { if ((e.target as HTMLElement)?.closest?.("[data-protected]")) e.preventDefault(); };
    const keys = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && /^[psc]$/i.test(e.key)) e.preventDefault(); };
    for (const ev of ["copy", "cut", "contextmenu", "dragstart"]) document.addEventListener(ev, block);
    document.addEventListener("keydown", keys);
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
      for (const ev of ["copy", "cut", "contextmenu", "dragstart"]) document.removeEventListener(ev, block);
      document.removeEventListener("keydown", keys);
    };
  }, [recordId, base, errText]);

  const providerName = rec ? L(rec.provider.name as Bilingual) : "";
  let body: ReactNode;
  if (err) body = <p className="err">{err}</p>;
  else if (!rec) body = <div className="empty"><span className="spin" />{t("loading")}</div>;
  else body = (
    <>
      <p className="lock-note">{Icon.lock}{t("readOnly")}</p>
      <div className="viewer-body" data-protected>
        <div className="thread">
          {rec.messages.map(m => {
            if (m.sender === "system") return <div key={m.seq} className="sys">{m.text}</div>;
            const mine = m.sender === viewer;
            const a = m.attachmentId ? rec.attachments.find(x => x.id === m.attachmentId) : undefined;
            return (
              <div key={m.seq} className={`msg${mine ? " mine" : ""}`}>
                <div className="bubble">
                  {a ? <div className="file">{images[a.id] && <img src={images[a.id]} alt="" draggable={false} />}<div className="file-row">{Icon.file}<span className="fname">{a.fileName}</span><span className="muted small">{fSize(a.sizeBytes)}</span></div></div> : m.text}
                </div>
                <div className="meta">{mine ? t("you") : m.sender === "patient" ? patientName : providerName} · {fTime(m.sentAt)}</div>
              </div>
            );
          })}
        </div>
        <div className="wm" style={{ backgroundImage: watermark(`${viewerName} · ${fDT(openedAt)}`) }} />
        <div className="away-msg">{t("hiddenAway")}</div>
      </div>
    </>
  );
  return (
    <Dialog wide onClose={onClose}
      title={rec ? `${fDT(rec.startedAt)} – ${fTime(rec.endedAt)}` : t("loading")}
      sub={rec && <>{providerName} · {patientName} · <span className="mono">{rec.recordName}</span></>}>
      {body}
    </Dialog>
  );
}

/** Hides protected content while the window isn't in focus. */
export function useAwayBlur() {
  useEffect(() => {
    const away = () => document.body.classList.add("away");
    const back = () => document.body.classList.remove("away");
    const vis = () => document.body.classList.toggle("away", document.hidden);
    window.addEventListener("blur", away); window.addEventListener("focus", back); document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("blur", away); window.removeEventListener("focus", back); document.removeEventListener("visibilitychange", vis); };
  }, []);
}
