// Tells open screens that something changed so they reload it. Events carry IDs only, never content.
// Two ways to hear about it: a WebSocket (instant, works on a long-running server), and a change counter in the
// database that screens poll when the socket can't connect (Vercel, where each function instance has its own memory).
import type { WebSocket } from "ws";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { liveVersions } from "./db/schema.ts";

export type ChatEvent = { type: "chat"; fileNumber: string; providerId: string } | { type: "consent" | "team"; fileNumber: string };

export class Hub {
  private sockets = new Map<string, Set<WebSocket>>();
  private pending = new Set<Promise<void>>();

  constructor(private db?: Db) {}

  add(key: string, socket: WebSocket) {
    let set = this.sockets.get(key);
    if (!set) this.sockets.set(key, set = new Set());
    set.add(socket);
    socket.on("close", () => { set!.delete(socket); if (!set!.size) this.sockets.delete(key); });
  }

  publish(keys: string[], event: ChatEvent) {
    const msg = JSON.stringify(event);
    for (const key of keys) for (const s of this.sockets.get(key) ?? []) if (s.readyState === 1) s.send(msg);
    if (this.db) {
      // Not awaited: a missed bump only delays a polling screen until the next change; it never blocks the request.
      const p = this.bump(keys).catch(e => console.error("live counter update failed:", (e as Error).name)).finally(() => this.pending.delete(p));
      this.pending.add(p);
    }
  }

  private async bump(keys: string[]) {
    for (const key of new Set(keys)) {
      await this.db!.insert(liveVersions).values({ key, version: 1 })
        .onConflictDoUpdate({ target: liveVersions.key, set: { version: sql`${liveVersions.version} + 1`, updatedAt: sql`now()` } });
    }
  }

  /** The counter a polling screen compares with its last value. */
  async version(key: string) {
    if (!this.db) return 0;
    const [row] = await this.db.select({ v: liveVersions.version }).from(liveVersions).where(eq(liveVersions.key, key));
    return row?.v ?? 0;
  }

  /** Waits for counter updates still in flight (tests, shutdown). */
  async idle() { await Promise.all([...this.pending]); }
}

export const staffKey = (id: string) => `staff:${id}`;
export const patientKey = (file: string) => `patient:${file}`;
