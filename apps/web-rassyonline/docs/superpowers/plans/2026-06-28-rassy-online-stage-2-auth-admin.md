# Rassy Online Stage 2 Auth And Admin Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add registration, login, signed sessions, roles, bootstrap admin, and an admin shell.

**Architecture:** Use app-owned Postgres tables and small server-side auth helpers so the Runtipi package remains inspectable. Passwords are hashed with bcrypt, sessions are random opaque tokens stored hashed in Postgres, and browser cookies contain only the opaque token. Admin access is role-gated on every server route.

**Tech Stack:** Next.js App Router, TypeScript, `pg`, `bcryptjs`, `zod`, Postgres.

---

## File Structure

- `apps/web/src/lib/db.ts`: Postgres pool and schema bootstrap.
- `apps/web/src/lib/auth/passwords.ts`: password hashing and verification.
- `apps/web/src/lib/auth/sessions.ts`: session token creation, hashing, cookie helpers.
- `apps/web/src/lib/auth/users.ts`: register/login/logout/current-user helpers.
- `apps/web/src/lib/auth/policy.ts`: registration policy and admin guard helpers.
- `apps/web/src/app/(auth)/login/page.tsx`: login/register screen.
- `apps/web/src/app/api/auth/register/route.ts`: registration endpoint.
- `apps/web/src/app/api/auth/login/route.ts`: login endpoint.
- `apps/web/src/app/api/auth/logout/route.ts`: logout endpoint.
- `apps/web/src/app/admin/page.tsx`: admin overview.
- `apps/web/src/app/admin/users/page.tsx`: user list.
- `apps/web/src/lib/auth/*.test.ts`: auth helper tests.

## Task 1: Auth Primitives

- [ ] Write failing tests for password hashing, session hashing, role policy, and bootstrap admin selection.
- [ ] Install `pg`, `bcryptjs`, and `zod`.
- [ ] Implement password/session/policy helpers.
- [ ] Run tests green.

## Task 2: Database Schema

- [ ] Add schema bootstrap for `users`, `sessions`, `admin_settings`, and `audit_events`.
- [ ] Ensure schema is idempotent.
- [ ] Add helpers for creating users, finding users, creating sessions, deleting sessions, and listing users.

## Task 3: Auth Routes And UI

- [ ] Add register/login/logout API routes.
- [ ] Add login/register page.
- [ ] Add current-user display on the home shell.
- [ ] Add tests for pure validation/policy helpers.

## Task 4: Admin Shell

- [ ] Add admin overview.
- [ ] Add admin users page.
- [ ] Protect admin routes server-side.
- [ ] Show app mode, registration policy, bootstrap admin email, and user list.

## Task 5: Runtime Verification

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Rebuild local compose stack.
- [ ] Register a user through HTTP.
- [ ] Login through HTTP.
- [ ] Verify session cookie reaches `/admin` only for admin users.
- [ ] Capture desktop/mobile screenshots for the updated shell.
- [ ] Run `docker compose config --quiet`, `validate-store.sh`, and `check-packaging.sh`.

