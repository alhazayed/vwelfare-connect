# Vwelfare Connect

Secure messaging between patients of Vwelfare Mental Health Center and their providers. A finished chat is saved to the patient's EMR file and then deleted from this platform. The data is mental-health conversations: treat every change as security- and privacy-sensitive.

Design documents: [technical specification](https://claude.ai/artifact/SSxsGkmyf1Ny9Yt2a9aEpg), [EMR API requirements](https://claude.ai/artifact/4nvQdLvgjkmAAGwnPy9kK2) (sent to the EMR vendor), and the clickable prototype `vwelfare-connect.html` (the approved UI design). `README.md` covers set-up and the pre-launch checklist.

## Commands

```bash
npm install
npm run setup                       # creates .env (random FIELD_ENCRYPTION_KEY, local time zone)
npm run seed                        # sample accounts → data/dev-accounts.txt (run with the app stopped)
npm run dev                         # mock EMR :4100, API :4000, web :5173 (Vite proxies /api and the WebSocket)
npm test                            # API end-to-end tests (vitest, in-memory DB, starts the mock EMR itself)
npm run typecheck                   # tsc for all three apps
npm run otp -- <secret>             # current 6-digit staff code (development only)
npm run db:generate -w @vwelfare/api -- --name <what_changed>   # migration after editing schema.ts
npm run vault:reset -- --confirm    # remove a forgotten secrets password (server only)
```

Run `npm test` and `npm run typecheck` before calling any change done.

## Layout

npm workspaces, TypeScript everywhere, ES modules with explicit `.ts`/`.tsx` import extensions.

- `apps/api` — Fastify 5, Drizzle ORM over PostgreSQL (PGlite in `data/pg` when `DATABASE_URL` is empty), zod for input.
  - `src/emr/client.ts` — the **only** code that talks to the EMR (R1–R5). Credentials are read on every call from the secrets store.
  - `src/services/chat.ts` — chat lifecycle: open → locked → saved to the EMR → deleted. Also `workerTick` (reminders, auto-finish, retries).
  - `src/services/secrets.ts`, `src/routes/secrets.ts` — the super admin's "APIs and services" tab (secrets, per-service on/off switch, connection tests, admin-added services) behind a separate vault password.
  - `src/auth.ts` — cookie sessions, idle timeouts, the `x-vwelfare` header check, `requireStaff` / `requirePatient`.
  - `src/routes/*` — one file per area (auth, admin, provider, patient, secrets). `src/db/schema.ts` is everything the platform stores.
  - `test/` — end-to-end tests through `app.inject`; `helpers.ts` builds an app with a fake clock (`env.clock.now`).
- `apps/web` — React 19 + Vite. `src/i18n.tsx` holds the English and Arabic text; `src/styles.css` carries the prototype's design tokens; pages in `src/pages`.
- `apps/mock-emr` — stand-in for the vendor's API, in memory, with sample patients. `POST /__mock/outage` simulates the EMR being down; `POST /__mock/reject` makes it refuse every saved chat.

## Rules that must not break

These come from the center's decisions and are covered by tests. Don't weaken them without the user explicitly asking.

- **Minimum data from the EMR:** read only the patient's name and visit dates. Never write patient names or visit dates to the database, logs or caches; fetch them from the EMR when a screen needs them.
- **Nothing stays after sync:** when the EMR confirms a chat (`201`/`200`), its messages, attachments, files and session are deleted in one transaction (`syncSession`). Finished chats are only ever read back from the EMR.
- **Exactly-once save:** the chat ID is the EMR `Idempotency-Key`; the request path and the worker take turns through the `nextAttemptAt` lease. A locked chat never accepts new messages.
- **Record name:** `{fileNumber}_{YYYY-MM-DD}_{HH-mm}` in `CENTER_TIMEZONE`, with `_2`, `_3`… when taken (also checked against the EMR's existing names).
- **Access:** providers reach only linked patients, and a provider who adds a patient already on the platform is linked only after the patient accepts; another provider's chats need the patient's granted consent (`checkRecordAccess`); the super admin never sees chat content; staff need MFA (`mfaOk`) for everything.
- **Encryption:** message text, mobile numbers, MFA secrets, saved secrets and stored files go through `FieldCipher` (AES-256-GCM).
- **No content in logs or notifications:** the audit log records actions by name, file number or record name, never message text, patient names or secret values. SMS and push texts never include names, providers or message text.
- **Read-only past chats:** served with `cache-control: no-store`; the viewer blocks copy, print and download, shows a watermark and blurs when the window loses focus.
- **Safety:** the "Need urgent help?" control stays reachable on every patient screen. Risk words (`lib/risk.ts`) flag the chat for the provider and show the patient emergency numbers.

## Conventions

- **Every user-facing string in English and Arabic.** Add both to `i18n.tsx` (or the page's local dictionary, as in `Secrets.tsx` and `Admin.tsx`). Check the screen in Arabic: layout is right-to-left; file numbers, record names and IDs stay left-to-right (`.mono`). Avoid gendered Arabic verbs for people whose gender isn't known.
- **Plain, specific wording** in the UI: say what happened and what to do next. Error responses are `{ code, message }`; the web app translates known codes (`err_<code>`).
- **Design:** reuse the tokens and components in `styles.css` (light and dark). Text at least 13px; touch targets 44px on phones; field borders `--field` (3:1 contrast).
- **Mutating requests** need the `x-vwelfare: 1` header; the web app's `api()` helper adds it.
- **Schema changes:** edit `schema.ts`, generate a migration, commit both. Migrations run at start-up; restart a running dev server afterwards.
- **Tests:** add or update a test in `apps/api/test` for every behaviour change, especially anything touching the rules above. Use `env.clock.now` to move time; staff and patient sessions expire after 15 and 30 idle minutes.
- **Git:** work on a branch and open a pull request against `main` (the repository is `alhazayed/vwelfare-connect`, private). Never commit `.env` or `data/`. Git has no global identity on this machine; commits so far use `-c user.name="alhazayed" -c user.email="alhazayed@gmail.com"`.

## Gotchas

- The development database (PGlite) allows one process at a time: run `npm run seed` with the app stopped.
- On Windows, stopping `npm run dev` from a background shell can leave the three Node processes running; check ports 4000, 4100 and 5173 before restarting.
- Sample sign-in details are in `data/dev-accounts.txt` (git-ignored). Don't print passwords or secrets into chat, commits or code.
- SMS, email and virus scanning are placeholders (`lib/notify.ts` prints to the console; `noScan` accepts every file). Don't describe them as working.
- `FIELD_ENCRYPTION_KEY` and `DATABASE_URL` must stay in the environment; the app needs them before it can read the secrets list.
