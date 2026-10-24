# Vwelfare Connect

Secure messaging between Vwelfare Mental Health Center patients and their providers. Every finished chat is saved to the patient's EMR file and then deleted from this platform.

Design documents:
- [Technical specification](https://claude.ai/artifact/SSxsGkmyf1Ny9Yt2a9aEpg)
- [EMR API requirements](https://claude.ai/artifact/4nvQdLvgjkmAAGwnPy9kK2) (sent to the EMR vendor)
- Clickable prototype: `vwelfare-connect.html` in this folder (open it in a browser)

## Run it on your computer

Needs Node.js 22 or later.

```bash
npm install
npm run setup     # creates .env with a random encryption key and your time zone
npm run seed      # adds sample accounts; prints passwords and saves them to data/dev-accounts.txt
npm run dev       # starts the mock EMR, the API and the web app
```

Then open http://localhost:5173.

- **Patients** sign in at `/` with a username and password.
- **Staff** sign in at `/staff` with email, password and a 6-digit code. Seeded staff already have an authenticator secret; get the current code with `npm run otp -- <secret>`, or add the secret to an authenticator app.
- The seed also prints a one-time invitation link for patient file 10517, so you can try the sign-up flow.

Run `npm run seed` while the app is stopped: the development database allows one process at a time. To start over, stop the app and delete the `data` folder.

## What's in the repository

| Folder | What it is |
| --- | --- |
| `apps/web` | The app for patients, providers and the super admin. React + TypeScript, Arabic and English, works on phones and computers. |
| `apps/api` | The server. Fastify + TypeScript, PostgreSQL through Drizzle ORM. Sign-in, permissions, chat, live updates, the EMR sync worker, the audit log. |
| `apps/mock-emr` | A stand-in for the EMR vendor's API (R1–R5 from the requirements document), with sample patients. Used until the vendor's sandbox is ready. |

Key files:
- `apps/api/src/emr/client.ts` — the only code that talks to the EMR. Replacing the EMR means replacing this file.
- `apps/api/src/services/chat.ts` — the chat lifecycle: open → locked → saved to the EMR → deleted here, with automatic finish, reminders and retries.
- `apps/api/src/db/schema.ts` — everything the platform stores. Patient names and visit dates are not in it.
- `apps/api/test/flows.test.ts` — end-to-end tests of the main flows (`npm test`).

## How the main rules are enforced

| Rule | Where |
| --- | --- |
| Only name and visit dates are read from the EMR | `emr/client.ts` (R1, R2); names are never written to the database |
| Nothing stays on the platform after the EMR confirms | `syncSession` in `services/chat.ts` deletes messages, files and the chat in one transaction after a `201` |
| A finished chat is sent exactly once | Locked chats carry the chat ID as `Idempotency-Key`; the worker and the Finish button take turns through a lease |
| Chats finish automatically | `workerTick`: reminder after 20 hours, finish after 24 hours without messages (editable in Chat rules) |
| Providers see other providers' chats only with consent | `checkRecordAccess` in `routes/provider.ts` |
| Staff use MFA; 5 wrong passwords or codes lock an account for 15 minutes; each code works once | `routes/auth.ts` |
| Message text, mobile numbers, MFA secrets and files are encrypted | `lib/crypto.ts` (AES-256-GCM) |
| Risk words flag the chat and show patients emergency numbers | `lib/risk.ts` (English and Arabic; the clinical lead should review the list) |
| After-hours automatic reply | Working hours in Chat rules; checked in `addMessage` |
| Past chats are read-only | Streamed from the EMR, never cached (`cache-control: no-store`); no download, copy or print, watermark, blur when the window loses focus |

## APIs and services (super admin)

The super admin's **APIs and services** tab shows one card per service the app connects to: the EMR, SMS, email and virus scanning, plus any services you add. Each card has the service's addresses and keys, an on/off switch and **Test connection**.

- **Second password.** The tab is locked behind a secrets password, separate from the sign-in password, set by the first super admin who opens it. It stays open for 10 minutes and locks after 5 wrong attempts (for 15 minutes).
- **Saved values win.** A value saved here is used instead of the `.env` file, straight away and without a restart. Clearing it goes back to `.env`.
- **Encrypted and audited.** Values are encrypted with `FIELD_ENCRYPTION_KEY`. Secret values are hidden until someone clicks **Show** (they hide again after 30 seconds). Every unlock, view and change goes in the audit log by name; values never do.
- **The server doesn't need the password.** The app reads the secrets itself, so the EMR connection keeps working when nobody is signed in. The password only controls who can see and change them.
- **Forgotten password.** It can't be recovered from the app. On the server, stop the app and run `npm run vault:reset -- --confirm`; saved secrets are kept, and the next super admin sets a new password.
- **Not in this list on purpose:** `FIELD_ENCRYPTION_KEY` and `DATABASE_URL`. The app needs them before it can read the list, so they stay in the server's environment.

- **Switching the EMR off** stops every call to the EMR at once (on every server instance): patient lookups and past chats show "paused by an administrator", and finished chats stay locked on the platform, not counted as failed attempts. When it's switched back on, the background worker sends each waiting chat once. Every admin gets an email both times.
- **Test connection.** The EMR test signs in with the saved credentials. For SMS, virus scanning and added services it only checks that something answers at the saved address (no key is sent); for email it waits for the mail server's greeting. Addresses inside the server's own network are never tested on the live system.
- **Services you add** have a name, a description, an optional address for testing, and their own secrets. Deleting one deletes its secrets. The app's own four services can be switched off but not deleted.

Only the EMR is used today. SMS, email and virus-scanning settings and switches can be saved now and are marked "Not connected yet" until those integrations are built; services you add are kept for later in the same way.

## Before real patients use it

These are deliberately not finished. Each needs a decision or a service from Vwelfare.

- [ ] **Connect the real EMR.** Point `EMR_BASE_URL`, `EMR_CLIENT_ID` and `EMR_CLIENT_SECRET` at the vendor's sandbox and adjust `emr/client.ts` to their actual API.
- [ ] **SMS and email.** `lib/notify.ts` only prints to the console (in full on a developer's machine; on Vercel and in production with masked addresses and no working invitation links). Plug in a provider licensed in your country.
- [ ] **Malware scanning.** `lib/files.ts` has a `Scanner` interface with a placeholder that accepts every file. Connect ClamAV or the cloud provider's scanner.
- [ ] **Encryption keys.** Move `FIELD_ENCRYPTION_KEY` into the cloud's key-management service.
- [ ] **File storage.** Replace the encrypted-disk store with private, encrypted cloud object storage.
- [ ] **Hosting.** PostgreSQL (`DATABASE_URL`) and the app in the same cloud region as the EMR, with HTTPS (`COOKIE_SECURE=true`). Set `TRUST_PROXY` to the load balancer's addresses (not needed on Vercel), or sign-in limits and the audit log see the proxy instead of the person. Build the web app with `npm run build`; serve it and proxy `/api` (including WebSockets) to the API.
- [ ] **Emergency numbers and working hours.** Set `EMERGENCY_NUMBER` (the national emergency number; production won't start without it, and patients see it whenever the admin hasn't saved one). Set the crisis line and working hours as super admin under Chat rules. The default working days (Sunday–Thursday, 08:00–16:00) are an assumption.
- [ ] **Password reset.** Patients currently contact the center; add a reset-by-SMS-code flow once SMS is connected.
- [ ] **Security review.** Independent penetration test. (`otplib` 13, `drizzle-orm` 0.45, `zod` 4 and `vitest` 5 are in; `npm audit` was clean on 24 October 2026.)
- [ ] **Clinical review.** Crisis wording, risk-word list, response-time promise, consent text.
- [ ] **Backups.** Decide the retention period (backups briefly contain open chats).

## Deploying on Vercel

`vercel.json` deploys the repository as one Vercel project with three services:

| Service | Public path | What it is |
| --- | --- | --- |
| `web` | everything except `/api` | The React app (Vite build). The app's own pages (`/staff`, `/admin`, `/provider`, `/patient`, `/invite/...`) are rewritten to `index.html` so links straight to them work. |
| `api` | `/api/*` | The Fastify API, run as a function. Its routes already start with `/api`, so no path rewriting is needed. |
| `mock-emr` | none (internal) | The stand-in EMR. Only `api` can reach it, through a binding that injects `MOCK_EMR_URL`. The API ignores it in production (`VERCEL_ENV=production`) and requires a real `EMR_BASE_URL` there. |

Vercel Cron calls `GET /api/internal/worker` every minute (reminders, automatic finishes, EMR retries) instead of the timer `npm run dev` uses. Every-minute schedules need a Pro plan.

Set these in the Vercel project's environment variables: `FIELD_ENCRYPTION_KEY`, `DATABASE_URL` (PostgreSQL; the API refuses to start on Vercel without it), `CRON_SECRET`, `APP_BASE_URL` (the deployment's address), `CENTER_TIMEZONE`, `COOKIE_SECURE=true`, and in production `EMR_BASE_URL` (https), `EMR_CLIENT_ID`, `EMR_CLIENT_SECRET`, plus `EMR_ALLOWED_HOSTS` if the super admin may switch the EMR to another host (for example a disaster-recovery address).

`vercel.json` also sets the web app's security headers (a strict Content-Security-Policy, no framing, HSTS). To check a change against them, run `npm run build -w @vwelfare/web` and then `npx vite preview` in `apps/web`, which serves the build with the same headers. Don't set `MOCK_EMR_URL`; Vercel fills it in.

Not ready for real patients on Vercel yet:

- Attachments use the encrypted-disk store, and functions don't keep their disk. File uploads need cloud object storage first.
- Live updates (`/api/ws`) are kept in each function instance's memory, so a screen connected to another instance can miss them. They need a shared channel (for example Redis pub/sub) before launch.
- Choose the function region to match the EMR and the center's data-residency rules.

To try a preview deployment without a computer, set `PREVIEW_SEED_PASSWORD` (12 characters or more) in the project's environment variables for **Preview only**. On start-up, a preview deployment then adds the sample accounts (super admin `admin@vwelfare.example`, providers `s.almansour@vwelfare.example` and `o.khalil@vwelfare.example`, patient `layla.h`) with that password, unless the super admin already exists. Nothing about them is logged. Staff set up their authenticator by scanning the QR code at first sign-in. Production never adds them. Give Preview its own `DATABASE_URL`, or the sample accounts end up in the production database.

Run all three services together locally with `vercel dev`.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start everything for development |
| `npm test` | Run the API's end-to-end tests |
| `npm run typecheck` | Check types in all apps |
| `npm run seed` | Add sample accounts (development only) |
| `npm run otp -- <secret>` | Print the current 6-digit staff code (development only) |
| `npm run vault:reset -- --confirm` | Remove a forgotten secrets password (run on the server with the app stopped) |
| `npm run db:generate -w @vwelfare/api` | Create a database migration after changing `schema.ts` |
