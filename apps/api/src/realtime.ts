// Tells open screens that something changed so they reload it. Events carry IDs only, never content.
import type { WebSocket } from "ws";

export type ChatEvent = { type: "chat"; fileNumber: string; providerId: string } | { type: "consent"; fileNumber: string };

export class Hub {
  private sockets = new Map<string, Set<WebSocket>>();

  add(key: string, socket: WebSocket) {
    let set = this.sockets.get(key);
    if (!set) this.sockets.set(key, set = new Set());
    set.add(socket);
    socket.on("close", () => { set!.delete(socket); if (!set!.size) this.sockets.delete(key); });
  }

  publish(keys: string[], event: ChatEvent) {
    const msg = JSON.stringify(event);
    for (const key of keys) for (const s of this.sockets.get(key) ?? []) if (s.readyState === 1) s.send(msg);
  }
}

export const staffKey = (id: string) => `staff:${id}`;
export const patientKey = (file: string) => `patient:${file}`;
