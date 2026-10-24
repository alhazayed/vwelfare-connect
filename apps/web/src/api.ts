import { useEffect, useRef } from "react";

export class ApiError extends Error {
  /** `field`: for invalid_input, the first input the server refused. */
  constructor(public status: number, public code: string, message: string, public field?: string) { super(message); }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "x-vwelfare": "1", ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  });
  if (!res.ok) {
    let j: { code?: string; message?: string; field?: string } = {};
    try { j = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("vw:signed-out"));
    throw new ApiError(res.status, j.code ?? "error", j.message ?? res.statusText, j.field || undefined);
  }
  return res.json() as Promise<T>;
}

export type Bilingual = { en?: string | null; ar?: string | null };

export type Me =
  | { kind: "staff"; role: "admin" | "provider"; id: string; email: string; mfaOk: boolean; mfaEnabled: boolean; name: Bilingual; specialty: Bilingual }
  | { kind: "patient"; fileNumber: string; username: string };

export type ChatMessage = {
  id: string; seq: number; sender: "patient" | "provider" | "system"; kind: "text" | "file" | "started" | "afterhours";
  risk: boolean; sentAt: string; text?: string; attachment?: { id: string; fileName: string; mimeType: string; sizeBytes: number };
};

export type ChatSession = {
  id: string; recordName: string; status: "open" | "locked"; startedBy: "patient" | "provider";
  startedAt: string; lastMessageAt: string; risk: boolean; messages: ChatMessage[];
};

export type RecordSummary = {
  recordId: string; recordName: string; providerStaffId: string; startedAt: string; endedAt: string;
  messageCount: number; attachmentCount: number; providerName?: Bilingual;
};

export type RecordView = {
  recordId: string; recordName: string; fileNumber: string; provider: { staffId: string; name: Bilingual };
  startedAt: string; endedAt: string; risk: boolean;
  messages: Array<{ seq: number; sentAt: string; sender: "patient" | "provider" | "system"; text?: string; attachmentId?: string; risk?: boolean }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
};

export type LiveEvent = { type: "chat"; fileNumber: string; providerId: string } | { type: "consent"; fileNumber: string };

/** Live updates over a WebSocket. Reconnects after drops. */
export function useLive(onEvent: (e: LiveEvent) => void) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      ws.onmessage = ev => { try { ref.current(JSON.parse(ev.data)); } catch { /* ignore malformed */ } };
      ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); ws?.close(); };
  }, []);
}
