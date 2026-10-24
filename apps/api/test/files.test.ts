// Shared files: the content must match the type, and photos lose their metadata before they are stored or sent.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchesType } from "../src/lib/files.ts";
import { Client, inviteToken, PASSWORD, setup } from "./helpers.ts";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => { env = await setup(); });
afterEach(async () => { await env.teardown(); });

async function patientChat() {
  await env.createStaff("provider", "sara@vwelfare.test", { emrStaffId: "ST-0193" });
  const sara = await env.staffClient("sara@vwelfare.test");
  await sara.ok("POST", "/api/provider/patients", { fileNumber: "10633", mobile: "+000 0000 1234" });
  const patient = new Client(env.app);
  await patient.ok("POST", "/api/auth/patient/accept-invite", { token: inviteToken(env.notifier.sent.at(-1)!.text), username: "mariam.s", password: PASSWORD, acceptTerms: true });
  const pid = (await patient.ok("GET", "/api/patient/me")).team[0].id;
  return { patient, url: `/api/patient/providers/${pid}/chat/files` };
}

describe("file checks", () => {
  it("refuses a file whose content doesn't match its name", async () => {
    const { patient, url } = await patientChat();
    const res = await patient.upload(url, "fake.png", Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe("file_mismatch");
    expect(env.files.files.size).toBe(0);
  });

  it("knows each shareable type by its first bytes", () => {
    expect(matchesType("application/pdf", Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(matchesType("application/pdf", Buffer.from("PK\x03\x04"))).toBe(false);
    expect(matchesType("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesType("image/png", Buffer.from("GIF89a"))).toBe(false);
    expect(matchesType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\x03\x04....word/document.xml"))).toBe(true);
    expect(matchesType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\x03\x04....xl/workbook.xml"))).toBe(false);
    expect(matchesType("audio/mp4", Buffer.from("\x00\x00\x00\x20ftypM4A "))).toBe(true);
  });

  it("removes location and camera data from photos before storing them", async () => {
    const { patient, url } = await patientChat();
    const photo = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#6699cc" } })
      .withExif({ IFD0: { Make: "PhoneMaker", Model: "Model X", Copyright: "Mariam" } })
      .jpeg().toBuffer();
    expect(photo.includes("PhoneMaker")).toBe(true);
    expect((await patient.upload(url, "photo.jpg", photo, "image/jpeg")).statusCode).toBe(200);
    const [stored] = [...env.files.files.values()];
    expect(stored!.includes("PhoneMaker")).toBe(false);
    expect(stored!.includes("Mariam")).toBe(false);
    const meta = await sharp(stored!).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });
});
