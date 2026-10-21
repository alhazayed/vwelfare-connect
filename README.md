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
| Staff use MFA; patients lock after 5 wrong passwords | `routes/auth.ts` |
| Message text, mobile numbers, MFA secrets and files are encrypted | `lib/crypto.ts` (AES-256-GCM) |
| Risk words flag the chat and show patients emergency numbers | `lib/risk.ts` (English and Arabic; the clinical lead should review the list) |
| After-hours automatic reply | Working hours in Chat rules; checked in `addMessage` |
| Past chats are read-only | Streamed from the EMR, never cached (`cache-control: no-store`); no download, copy or print, watermark, blur when the window loses focus |

## Before real patients use it

These are deliberately not finished. Each needs a decision or a service from Vwelfare.

- [ ] **Connect the real EMR.** Point `EMR_BASE_URL`, `EMR_CLIENT_ID` and `EMR_CLIENT_SECRET` at the vendor's sandbox and adjust `emr/client.ts` to their actual API.
- [ ] **SMS and email.** `lib/notify.ts` only prints to the console. Plug in a provider licensed in your country.
- [ ] **Malware scanning.** `lib/files.ts` has a `Scanner` interface with a placeholder that accepts every file. Connect ClamAV or the cloud provider's scanner.
- [ ] **Encryption keys.** Move `FIELD_ENCRYPTION_KEY` into the cloud's key-management service.
- [ ] **File storage.** Replace the encrypted-disk store with private, encrypted cloud object storage.
- [ ] **Hosting.** PostgreSQL (`DATABASE_URL`) and the app in the same cloud region as the EMR, with HTTPS (`COOKIE_SECURE=true`). Build the web app with `npm run build`; serve it and proxy `/api` (including WebSockets) to the API.
- [ ] **Emergency numbers and working hours.** Set them as super admin under Chat rules. The default working days (Sunday–Thursday, 08:00–16:00) are an assumption.
- [ ] **Password reset.** Patients currently contact the center; add a reset-by-SMS-code flow once SMS is connected.
- [ ] **Security review.** Independent penetration test, and update the authenticator library (`otplib` 12 is deprecated in favour of 13).
- [ ] **Clinical review.** Crisis wording, risk-word list, response-time promise, consent text.
- [ ] **Backups.** Decide the retention period (backups briefly contain open chats).

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start everything for development |
| `npm test` | Run the API's end-to-end tests |
| `npm run typecheck` | Check types in all apps |
| `npm run seed` | Add sample accounts (development only) |
| `npm run otp -- <secret>` | Print the current 6-digit staff code (development only) |
| `npm run db:generate -w @vwelfare/api` | Create a database migration after changing `schema.ts` |
