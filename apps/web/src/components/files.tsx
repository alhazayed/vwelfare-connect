import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.tsx";

const MAX_PAGES = 50;

/**
 * Draws a PDF's pages as pictures inside the protected viewer, so the browser's own PDF viewer (with its download
 * and print buttons) is never used. pdf.js is loaded only when a PDF is opened.
 */
export function PdfPages({ data }: { data: ArrayBuffer }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [more, setMore] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = ref.current!;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      // A copy: pdf.js takes ownership of the buffer it is given.
      // Fonts are drawn as shapes (no FontFace), so the page's font CSP stays strict.
      const task = pdfjs.getDocument({ data: data.slice(0), disableFontFace: true, enableXfa: false });
      const doc = await task.promise;
      const width = Math.min(host.clientWidth || 600, 900);
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const ratio = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: scale * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
        canvas.className = "pdf-page";
        canvas.setAttribute("aria-label", t("pdfPage", { n }));
        canvas.setAttribute("role", "img");
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (!cancelled) host.appendChild(canvas);
      }
      if (!cancelled) { setMore(Math.max(0, doc.numPages - MAX_PAGES)); setState("done"); }
      await task.destroy();
    })().catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; host.replaceChildren(); };
  }, [data, t]);

  return (
    <div className="pdf">
      <div ref={ref} className="pdf-pages" />
      {state === "loading" && <p className="muted small"><span className="spin" />{t("loading")}</p>}
      {state === "error" && <p className="err">{t("fileOpenFailed")}</p>}
      {more > 0 && <p className="muted small">{t("pdfMorePages", { n: more })}</p>}
    </div>
  );
}

/** A voice note or other audio file, played in the page without a download button. */
export function AudioPlayer({ url }: { url: string }) {
  return <audio className="audio" controls preload="metadata" src={url} controlsList="nodownload noplaybackrate" onContextMenu={e => e.preventDefault()} />;
}
