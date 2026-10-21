import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { HttpError, type Deps } from "./deps.ts";
import { registerAuth } from "./auth.ts";
import { EmrUnavailable } from "./emr/client.ts";
import { MAX_FILE_BYTES } from "./lib/files.ts";
import { patientKey, staffKey } from "./realtime.ts";
import { authRoutes } from "./routes/auth.ts";
import { adminRoutes } from "./routes/admin.ts";
import { providerRoutes } from "./routes/provider.ts";
import { patientRoutes } from "./routes/patient.ts";

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ? { redact: ["req.headers.cookie", "req.headers.authorization"] } : false,
    trustProxy: true
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  await app.register(websocket);
  registerAuth(app, deps);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ code: err.code, message: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ code: "invalid_input", message: err.issues[0]?.message ?? "Invalid input", issues: err.issues });
    if (err instanceof EmrUnavailable) {
      req.log.warn({ err: err.message }, "EMR unavailable");
      return reply.code(503).send({ code: "emr_unavailable", message: "The EMR isn't responding right now. Try again in a moment." });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ code: e.code ?? "error", message: e.message ?? "Request failed" });
    req.log.error(err);
    return reply.code(500).send({ code: "server_error", message: "Something went wrong" });
  });

  // Responses with patient data must never be cached.
  app.addHook("onSend", async (_req, reply) => { if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store"); });

  app.get("/api/health", async () => ({ ok: true }));

  // Live updates: tells the signed-in person's open screens to reload. Carries IDs only.
  app.get("/api/ws", { websocket: true }, (socket, req) => {
    const a = req.auth;
    if (!a || (a.kind === "staff" && !a.mfaOk)) { socket.close(4401, "not_signed_in"); return; }
    deps.hub.add(a.kind === "staff" ? staffKey(a.staff.id) : patientKey(a.patient.fileNumber), socket);
  });

  authRoutes(app, deps);
  adminRoutes(app, deps);
  providerRoutes(app, deps);
  patientRoutes(app, deps);
  return app;
}
