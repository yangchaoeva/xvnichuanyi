# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is a Next.js 14 App Router application for virtual try-on:
- Users authenticate with email/password sessions (cookie-based auth).
- Users upload person/garment images to Vercel Blob.
- The app creates async try-on tasks, calls Volcano Engine Ark image generation, then stores generated outputs back to Blob.
- Task status is polled from the frontend until success/failure.

## Common commands

Run from repo root.

```bash
npm install
```

```bash
npm run dev
```
Starts Next dev server on port 3000 (runs `predev` cleanup first).

```bash
npm run build
npm run start
```
Production build and server.

```bash
npm run lint
```
Uses `next lint` with `next/core-web-vitals` config.

```bash
npm run clean
```
Removes `.next` and `.turbo` caches.

```bash
npm run diagnose:local
```
Auto-starts dev server if needed, then runs browser diagnostics.

```bash
npm run diagnose:browser -- http://localhost:3000
```
Playwright-based console/network diagnostic against a target URL.

### Database commands (Drizzle / Postgres)

```bash
npm run db:generate
npm run db:migrate
npm run db:push
```
`db:push` uses `--force`; use carefully.

```bash
npm run migrate:tasks
```
Runs sqlite→neon migration utility in `scripts/migrate-sqlite-to-neon.mjs`.

## Testing status

There is currently no project test script in `package.json` and no first-party `src` test suite committed. If adding tests, also add explicit scripts (for example `test`, `test:e2e`, and optionally a single-test command) to keep future automation consistent.

## Architecture map

### 1) App Router UI + task polling flow

- Main UI: `src/app/page.tsx`
  - Uploads files via `/api/upload`.
  - Starts try-on task via `/api/try-on`.
  - Polls `/api/status?taskId=...` every 2s until `success` or `failed`.
- Auth pages: `src/app/login/page.tsx`, `src/app/register/page.tsx`.

UI state is intentionally task-driven (`idle/uploading/processing/success/error`) and tied to backend task status.

### 2) API layer (Route Handlers)

All key routes are Node runtime handlers under `src/app/api/**`:

- Auth:
  - `auth/register`, `auth/login`, `auth/logout`, `auth/logout-all`, `auth/me`
- Try-on pipeline:
  - `upload` (store input images)
  - `try-on` (create task + async processing)
  - `status` (poll task result)
- Environment/ops:
  - `health`, `turnstile/config`

`src/middleware.ts` gates page access by `auth_session` cookie:
- redirects unauthenticated users from protected pages to `/login`
- redirects authenticated users away from `/login` and `/register`

### 3) Auth and session model

- Core auth utilities: `src/lib/auth.ts`
  - password hashing: `scrypt`
  - session token hashing: `sha256`
  - cookie name: `auth_session`
  - login throttling window/count logic
- Persistence functions: `src/lib/db.ts`
  - session creation/revocation
  - login attempt tracking
- Schema: `src/db/schema.ts`
  - `users`, `auth_sessions`, `auth_login_attempts`

Auth is server-validated (cookie → hashed token → DB session lookup), not JWT-based.

### 4) Try-on processing pipeline

Entry route: `src/app/api/try-on/route.ts`

Flow:
1. Validate authenticated user.
2. Accept either uploaded URLs (`personUrl/garmentUrl`) or base64 payloads.
3. Create pending task record in DB.
4. Fire async `processTask(...)` (non-blocking response returns `taskId`).
5. Worker calls Ark image generation service (`src/services/arkImageGeneration.ts`).
6. On success, transfer remote result to Blob via `src/lib/blob.ts`.
7. Save generated asset record and mark task `success`; otherwise map errors and mark `failed`.

Important behavior:
- Ark call may retry using public URLs when initial data URL mode returns 400/415 and `APP_PUBLIC_URL` is configured.
- Final persisted result URL comes from Blob, not direct Ark URL.

### 5) Data and schema responsibilities

- Drizzle schema definitions: `src/db/schema.ts`
- DB access and bootstrap/migrations-in-code: `src/lib/db.ts`

`lib/db.ts` does two things:
- normal query/update operations via Drizzle + `pg`
- runtime schema-compat bootstrap (`ensureNeonSchema`) that creates/patches tables/columns/indexes for Neon Postgres environments

Core business tables for try-on flow:
- `tasks` (pending/processing/success/failed state machine)
- `user_assets` (persisted generated outputs and source linkage)

### 6) File/media handling split

- `src/app/api/upload/route.ts`: user-uploaded input files → Blob (`uploads/...`)
- `src/lib/upload.ts`: base64-to-local-file helper writing to `public/uploads` (used by try-on route for base64 path)
- `src/lib/blob.ts`: remote HTTPS image fetch + validation + Blob persistence (`generated/...`)

When changing media flow, keep the distinction between temporary input handling and final output persistence.

## Required environment variables (inferred from runtime checks)

- `DATABASE_URL` or `NEON_DATABASE_URL`
- `ARK_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `TURNSTILE_SECRET_KEY` (and optional local override)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and optional local override)
- `RESEND_API_KEY` (for welcome email)

Behavior-affecting optional vars:
- `APP_PUBLIC_URL` (used for Ark fallback to publicly reachable URLs)
- `ADMIN_EMAILS` (comma-separated; grants admin role at registration)

## Path alias

TypeScript path alias is enabled:
- `@/*` → `src/*`

Prefer alias imports for internal modules to match existing code style.
