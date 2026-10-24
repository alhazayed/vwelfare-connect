// Live updates without a WebSocket: a change counter in the database that screens poll.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

describe("live updates by polling", () => {
  it("raises the provider's and the patient's counters when a message arrives, and doesn't keep sessions alive", async () => {
    await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
    const sara = await env.staffClient("sara@vwelfare.test");
    await sara.ok("POST", "/api/provider/patients", { fileNumber: "10633", mobile: "+000 0000 1234" });
    const patient = new Client(env.app);
    await patient.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(env.notifier.sent.at(-1)!.text), username: "mariam.s", password: PASSWORD, acceptTerms: true });
    const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
    await env.deps.hub.idle();

    const before = (await sara.ok("GET", "/api/live")).v;
    await patient.ok("POST", `/api/patient/providers/${pid}/chat/messages`, { text: "Hello" });
    await env.deps.hub.idle();
    expect((await sara.ok("GET", "/api/live")).v).toBeGreaterThan(before);
    expect((await patient.ok("GET", "/api/live")).v).toBeGreaterThan(0);

    // Polling every few seconds for 20 minutes doesn't count as activity: the staff session still ends after 15 idle minutes.
    for (let i = 0; i < 20; i++) {
      env.clock.now = new Date(env.clock.now.getTime() + 60_000);
      await sara.req("GET", "/api/live");
    }
    expect((await sara.req("GET", "/api/live")).statusCode).toBe(401);
    expect((await new Client(env.app).req("GET", "/api/live")).statusCode).toBe(401);
  });
});
