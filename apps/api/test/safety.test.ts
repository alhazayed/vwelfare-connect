// Patient safety and privacy safeguards: the crisis numbers, what the console notifier prints, and EMR redirects.
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmrClient, EmrUnavailable } from "../src/emr/client.ts";
import { ConsoleNotifier } from "../src/lib/notify.ts";
import { Client, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

const RULES = { remindHours: 20, autoFinishHours: 24, crisisLineNumber: "", workingHours: { days: [0, 1, 2, 3, 4], start: "08:00", end: "16:00" } };

describe("crisis numbers", () => {
  it("always gives patients the national emergency number, even when the admin hasn't saved one or clears it", async () => {
    env.deps.config.EMERGENCY_NUMBER = "999";
    const anon = new Client(env.app);
    expect((await anon.ok("GET", "/api/public/help")).emergencyNumber).toBe("999");

    await env.createStaff("admin", "admin@vwelfare.test");
    const admin = await env.staffClient("admin@vwelfare.test");
    await admin.ok("PUT", "/api/admin/rules", { ...RULES, emergencyNumber: "" });
    expect((await anon.ok("GET", "/api/public/help")).emergencyNumber).toBe("999");

    // A number the admin saves takes precedence.
    await admin.ok("PUT", "/api/admin/rules", { ...RULES, emergencyNumber: "112" });
    expect((await anon.ok("GET", "/api/public/help")).emergencyNumber).toBe("112");
  });
});

describe("console notifier", () => {
  it("prints no working invitation link or full mobile number outside local development", async () => {
    const lines: string[] = [];
    const n = new ConsoleNotifier(l => lines.push(l), false);
    await n.sms("+962 7 9123 4567", "Vwelfare: set up your account: https://app.example/invite/patient#AbCdEfGh123456789_-xyz");
    await n.email("sara.k@vwelfare.example", "Your account", "Set your password: https://app.example/invite/staff#ZyXwVu987654321abcdef");
    const out = lines.join("\n");
    expect(out).not.toMatch(/AbCdEfGh|ZyXwVu|9123|sara\.k/);
    expect(out).toContain("…67");
    expect(out).toContain("s…@vwelfare.example");
    expect(out).toContain("#[hidden]");
    // The copy kept for tests and for the real provider later is complete.
    expect(n.sent[0]!.text).toContain("#AbCdEfGh123456789_-xyz");
  });
});

describe("EMR redirects", () => {
  let servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.map(s => new Promise(r => s.close(r)))); servers = []; });
  const listen = (handler: Parameters<typeof createServer>[1]) => new Promise<string>(resolve => {
    const s = createServer(handler!);
    servers.push(s);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); resolve(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`); });
  });

  it("never follows a redirect, so a chat can't be sent to another host", async () => {
    let elsewhere = 0;
    const other = await listen((_req, res) => { elsewhere++; res.writeHead(201, { "content-type": "application/json" }).end('{"recordId":"x","access_token":"t","expires_in":3600}'); });
    const emr = await listen((req, res) => {
      if (req.url === "/oauth/token") return res.writeHead(200, { "content-type": "application/json" }).end('{"access_token":"t","expires_in":3600}');
      res.writeHead(307, { location: `${other}/steal` }).end();
    });
    const client = new EmrClient(async () => ({ baseUrl: emr, clientId: "c", clientSecret: "s" }));
    const record = { recordName: "10633_2026-10-21_09-00", fileNumber: "10633", provider: { staffId: "ST-1", name: "x" }, startedAt: "", endedAt: "", finishedBy: "provider" as const, messages: [], attachments: [] };
    await expect(client.saveChatRecord(record, [], "id-1")).rejects.toBeInstanceOf(EmrUnavailable);
    expect(elsewhere).toBe(0);
  });
});
