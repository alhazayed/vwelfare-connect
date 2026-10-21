import { buildApp } from "./app.ts";
import { createDeps } from "./bootstrap.ts";
import { workerTick } from "./services/chat.ts";

const { deps, close } = await createDeps();
const app = await buildApp(deps, { logger: true });
await app.listen({ port: deps.config.API_PORT, host: "127.0.0.1" });
app.log.info(`Center time zone: ${deps.config.CENTER_TIMEZONE}`);

// Reminders, automatic finishes and EMR retries.
let running = false;
const timer = setInterval(async () => {
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
