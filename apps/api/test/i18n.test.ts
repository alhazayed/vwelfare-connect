// Every error code the API can send must have English and Arabic text in the web app,
// or Arabic screens would fall back to a general message.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const api = new URL("../src/", import.meta.url).pathname;
const web = new URL("../../web/src/", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".ts") ? [join(dir, d.name)] : []);
}

// Not shown to people: the scheduled worker's token check.
const NOT_SHOWN = new Set(["unauthorized"]);

describe("error messages", () => {
  it("has English and Arabic text for every error code", () => {
    const codes = new Set<string>();
    for (const f of files(api)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/HttpError\(\d+, "([a-z_]+)"/g)) codes.add(m[1]!);
      for (const m of src.matchAll(/code: "([a-z_]+)"/g)) codes.add(m[1]!);
      for (const m of src.matchAll(/return "([a-z_]+)"/g)) codes.add(m[1]!); // secrets validation codes
    }
    for (const m of readFileSync(join(api, "services/secrets.ts"), "utf8").matchAll(/"(emr_[a-z_]+|bad_url)"/g)) codes.add(m[1]!);
    expect(codes.size).toBeGreaterThan(20);

    const dictionaries = ["i18n.tsx", "pages/Secrets.tsx", "pages/Admin.tsx"].map(f => readFileSync(join(web, f), "utf8"));
    const translated = (code: string) => dictionaries.some(d => (d.match(new RegExp(`\\berr_${code}:`, "g")) ?? []).length >= 2);
    const missing = [...codes].filter(c => !NOT_SHOWN.has(c) && !translated(c));
    expect(missing).toEqual([]);
  });
});
