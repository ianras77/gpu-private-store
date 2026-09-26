# Rassy's + OpenFang implementation checkpoint

Updated: 2026-09-26 UTC

## Baseline and authority

- Release source: `gpu-private-store/apps/web-rassys`, parent HEAD `be44e4d933d5ed88ae00eeeab9e88969e2450b92`, scoped last commit `025b0d15ed575fa6749a2ab38db67b4e16101781`. Branch: `codex/rassyonline-reliable-minimal-20260926`. Unrelated changes exist in sibling `web-rassyonline`; do not stage them.
- Older standalone `/data/apps/2-Migrated/web-rassy` HEAD `6ca94ba159d505554f3ea7c0f793e606fd69eea1`. OpenFang source `/data/apps/openfang` HEAD `4a5000eadd2b59c7c98e9e7719de677d057f42cb`. Step Parent Path checkout location unresolved.
- Live project `web-rassys_gpu-private-store` has eight healthy containers (web, intelligence, radio controller, Liquidsoap, Minecraft, Postgres, Redis, Icecast), each up seven days when inspected. This is health evidence only; image/source parity and behavior remain unverified.
- `docs/SOURCE-RECONCILIATION.md` and `docs/QUALIFICATION.md` were read first. The latter records that supported Runtipi backup attempts produced **no artifact**. No production deploy or migration until an actual backup and restore rehearsal succeeds.

## Slice A: chat privacy and pending state

- Observed defect: `/api/radio/chat` accepted arbitrary query/body `clientId`, allowing cross-reader history retrieval. Three web chat callers supplied client-generated IDs; the station deck stored one in localStorage. Controller's `/public/chat` is internal and still keyed by `clientId`.
- Source change: web API now issues/verifies an HMAC-signed HttpOnly SameSite cookie using the configured server secret; rejects a caller-supplied `clientId`; forwards only the verified visitor ID; scopes request IDs to the visitor; sends private/no-store responses. Web callers no longer send IDs. Station deck handles pending completion, 30-second timeout and error replies.
- Commands/results: `pnpm run lint:web` PASS; `pnpm run build:web` PASS (expected absent build-time `DATABASE_URL` warnings); Node identity check passed for two distinct visitors and forged cookies. Two-browser and guessed-ID live proof pending a safe staged deployment.
- Current blocker: no restore-tested production backup; staging and device access not yet established.
- Next action: commit scoped slice A, then inspect shared player, stream behavior and older native app for slices B/C; inventory installed OpenFang and Step Parent Path before D.
