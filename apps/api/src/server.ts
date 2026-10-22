import { buildApp } from "./app.ts";
import { createDeps } from "./bootstrap.ts";
import { workerTick } from "./services/chat.ts";

const started = Date.now();
const { deps, close } = await createDeps();
console.log(`Database ready after ${Date.now() - started} ms`);
const app = await buildApp(deps, { logger: true });
// Vercel runs the server inside a function and tells it which port to use.
await app.listen(process.env.VERCEL
  ? { port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" }
  : { port: deps.config.API_PORT, host: "127.0.0.1" });
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
