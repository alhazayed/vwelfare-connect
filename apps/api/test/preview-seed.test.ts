import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { staff } from "../src/db/schema.ts";
import { PREVIEW_ACCOUNTS, seedPreview } from "../src/services/preview-seed.ts";
import { Client, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

const PW = "preview-pass-1234";
const withConfig = (over: Partial<Env["deps"]["config"]>) => ({ ...env.deps, config: { ...env.deps.config, ...over } });

describe("preview sample accounts", () => {
  it("adds nothing outside preview deployments or without a password", async () => {
    expect(await seedPreview(withConfig({ VERCEL_ENV: "preview" }))).toBe("off");
    expect(await seedPreview(withConfig({ PREVIEW_SEED_PASSWORD: PW }))).toBe("off");
    expect(await seedPreview(withConfig({ VERCEL_ENV: "production", production: true, PREVIEW_SEED_PASSWORD: PW }))).toBe("off");
    expect(await env.deps.db.select().from(staff)).toHaveLength(0);
  });

  it("adds the accounts once, with the set password and staff MFA still to set up", async () => {
    const deps = withConfig({ VERCEL_ENV: "preview", PREVIEW_SEED_PASSWORD: PW });
    expect(await seedPreview(deps)).toBe("added");
    expect(await seedPreview(deps)).toBe("exists");
    expect(await env.deps.db.select().from(staff)).toHaveLength(3);

    const s = new Client(env.app);
    expect((await s.ok("POST", "/api/auth/staff/login", { email: PREVIEW_ACCOUNTS.providers[0], password: PW })).next).toBe("mfa-setup");
    const { secret } = await s.ok("GET", "/api/auth/staff/mfa-setup");
    await s.ok("POST", "/api/auth/staff/mfa", { code: authenticator.generate(secret) });
    expect((await s.ok("GET", "/api/provider/patients")).length).toBe(1);

    const p = new Client(env.app);
    await p.ok("POST", "/api/auth/patient/login", { username: PREVIEW_ACCOUNTS.patient.username, password: PW });
  });
});
