# Rassy's + OpenFang implementation checkpoint

Updated: 2026-09-26 UTC

## Baseline and authority

- Release source: `gpu-private-store/apps/web-rassys`, starting parent HEAD `be44e4d933d5ed88ae00eeeab9e88969e2450b92`, slice A commit `868216cf3`. Scoped continuation branch: `codex/rassys-openfang-20260926`. Unrelated changes exist in sibling `web-rassyonline`; do not stage them.
- Older standalone `/data/apps/2-Migrated/web-rassy` HEAD `6ca94ba159d505554f3ea7c0f793e606fd69eea1`. OpenFang source `/data/apps/openfang` HEAD `4a5000eadd2b59c7c98e9e7719de677d057f42cb`. Step Parent Path checkout location unresolved.
- Live project `web-rassys_gpu-private-store` has eight healthy containers (web, intelligence, radio controller, Liquidsoap, Minecraft, Postgres, Redis, Icecast), each up seven days when inspected. This is health evidence only; image/source parity and behavior remain unverified.
- Docker mount confirms `${APP_DATA_DIR}` resolves to `/data/runtipi/app-data/gpu-private-store/web-rassys`; intended reports root is `/data/runtipi/app-data/gpu-private-store/web-rassys/app-data/web-rassys/reports`. Web image ID at inspection: `sha256:0363356b919c84fe46d537a6746243200bcf8c471ee2b67b1eb7759afce17539`. The container's Compose label points to this release source path, but build content parity is unverified.
- `docs/SOURCE-RECONCILIATION.md` and `docs/QUALIFICATION.md` were read first. The latter records that supported Runtipi backup attempts produced **no artifact**. No production deploy or migration until an actual backup and restore rehearsal succeeds.

## Slice A: chat privacy and pending state

- Observed defect: `/api/radio/chat` accepted arbitrary query/body `clientId`, allowing cross-reader history retrieval. Three web chat callers supplied client-generated IDs; the station deck stored one in localStorage. Controller's `/public/chat` is internal and still keyed by `clientId`.
- Source change: web API now issues/verifies an HMAC-signed HttpOnly SameSite cookie using the configured server secret; rejects a caller-supplied `clientId`; forwards only the verified visitor ID; scopes request IDs to the visitor; sends private/no-store responses, including on upstream error. Web callers no longer send IDs. Station deck handles pending completion, 30-second timeout and error replies.
- Commands/results: `pnpm run lint:web` PASS; `pnpm run build:web` PASS (expected absent build-time `DATABASE_URL` warnings); Node identity check passed for two distinct visitors and forged cookies. Temporary local Next server plus mock controller: two issued cookie identities isolated a posted message (A retrieved it; B saw none); GET/POST with caller-supplied IDs both returned 400. The mock servers were stopped. This is route integration proof, not two real browsers or deployed proof.
- Current blocker: no restore-tested production backup; staging and device access not yet established.
- Next action: commit scoped slice A, then inspect shared player, stream behavior and older native app for slices B/C; inventory installed OpenFang and Step Parent Path before D.

## Slice B: shared web player (in progress)

- Existing `PersistentRadioPlayerProvider` wraps the root layout and owns station playback and Media Session. It used `key={activeStreamUrl}` on `<audio>`, remounting the element at each quality/fallback switch despite a persistent `MediaElementAudioSourceNode`. Removed that key to keep the station element stable. The separate `AudioShelfPlayer` remains a second element for authored library/story playback; it pauses radio through `rassy:library-play`, so broader single-controller consolidation is still open.
- Homepage station deck labeled fallback and paused playback `ON AIR`; now labels library fallback and ready state explicitly.
- Real public `/live.mp3` yielded 250600 bytes in eight seconds; `ffprobe` decoded an MP3 stream, 44100 Hz stereo. This is a byte/codec check, not browser or sustained-play proof.
- `pnpm run lint:web` and `pnpm run build:web` PASS after source changes. iOS Safari, Android Chrome, Bluetooth, lock screen and route continuity remain unverified.
- Older standalone `apps/mr-rassy-radio` is an Expo 54 app with `expo-audio` and iOS/Android scripts; `apps/radio-ios` is separate starter scaffold. API comparison and native port have not started.
- Next action: finish build, inspect audio source switch behavior and route continuity in browser, commit player fix, then port native app with exact API contract.
