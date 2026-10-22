import { buildApp } from "./app.ts";
import { createDeps } from "./bootstrap.ts";
import { workerTick } from "./services/chat.ts";
import { seedPreview } from "./services/preview-seed.ts";

const { deps, close } = await createDeps();
try {
  if (await seedPreview(deps) === "added") console.log("Preview sample accounts added");
} catch (e) {
  console.error("Could not add the preview sample accounts:", (e as Error).name);
}
const app = await buildApp(deps, { logger: true });
// Vercel runs the server inside a function and tells it which port to use. Don't await
// listen(): Vercel only reports the server as listening once this module has finished
// loading, so awaiting it at the top level never resolves.
app.listen(process.env.VERCEL
  ? { port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" }
  : { port: deps.config.API_PORT, host: "127.0.0.1" }
).catch((e) => { app.log.error(e, "could not start listening"); process.exit(1); });
app.log.info(`Center time zone: ${deps.config.CENTER_TIMEZONE}`);

// Reminders, automatic finishes and EMR retries.
// On Vercel there is no long-running process: Vercel Cron calls GET /api/internal/worker instead.
let running = false;
const timer = process.env.VERCEL ? undefined : setInterval(async () => {
  if (running) return;
  running = true;
  try { await workerTick(deps); } catch (e) { app.log.error(e, "worker tick failed"); } finally { running = false; }
}, 15_000);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    clearInterval(timer);
    await app.close();
    await close();
    process.exit(0);
  });
}
