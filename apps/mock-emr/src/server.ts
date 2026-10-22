import { buildMockEmr } from "./app.ts";

try { process.loadEnvFile(new URL("../../../.env", import.meta.url)); } catch { /* no .env: use defaults */ }

const port = Number(process.env.MOCK_EMR_PORT ?? 4100);
const { app } = buildMockEmr({
  clientId: process.env.EMR_CLIENT_ID ?? "vwelfare-connect",
  clientSecret: process.env.EMR_CLIENT_SECRET ?? "dev-secret",
  logger: true
});
// Vercel runs the server inside a function and tells it which port to use.
await app.listen(process.env.VERCEL ? { port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" } : { port, host: "127.0.0.1" });
