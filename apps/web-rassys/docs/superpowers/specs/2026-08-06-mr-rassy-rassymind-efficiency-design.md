# Mr Rassy RassyMind Efficiency Release Design

## Goal

Make the Runtipi `web-rassys` app’s Mr Rassy chat and live-DJ paths responsive and reliably RassyMind-backed, while preserving the working radio/request-line behavior and releasing the result as a versioned Runtipi upgrade.

## Current evidence

- The deployed app is healthy, but `/api/radio/status` reports `djMode: fallback`.
- Radio-controller logs show repeated RassyMind `503 queue is full` responses and 30–120 second upstream timeouts.
- Listener chat, playlist decisions, booth dossiers, track intelligence, transition planning, and site curios compete through the same proxy queue.
- The source still uses Cheshire-named controller configuration and service wiring even though the live upstream is RassyMind.
- The current deployed version is `1.0.21`.

## Chosen approach

Keep the internal proxy boundary for this release to limit operational blast radius, but make RassyMind the only canonical application contract:

1. Controller and proxy configuration use `RASSYMIND_BASE_URL`, `RASSYMIND_API_KEY`, and explicit RassyMind model names as the primary settings. Existing internal service naming may remain where it is only a local implementation boundary.
2. Listener chat receives a reserved high-priority path with bounded waiting and no retry cascade.
3. Background work is shed or delayed while recent listener activity exists. Notes, track intelligence, curio generation, and nonessential enrichment must not consume the listener capacity.
4. DJ decisions use compact, bounded request settings and avoid repeating fallback/recovery calls when the upstream is saturated.
5. Existing request-line semantics remain unchanged: accepted requests stay visible, multi-track requests remain pending until their final track, and broad requests remain visible without fabricated track IDs.
6. The app version becomes `1.0.22`, followed by an actual Runtipi update/recreate and live qualification.

## Components and data flow

The intended live path is:

`browser chat` → `Next.js /api/radio/chat` → `radio-controller /public/chat` → `listener-priority proxy lane` → `RassyMind /v1/chat/completions` → normalized Mr Rassy reply → Redis chat history/request line.

The background path remains available but subordinate:

`scheduler/background refresh` → `radio-controller` → `low-priority proxy lane` → RassyMind only when listener activity and capacity gates allow it.

No new external service is introduced in this release.

## Efficiency changes

- Add explicit listener reservation/priority in the proxy queue so background requests cannot consume all active capacity.
- Use zero or very short background queue waits during listener activity; drop optional enrichment cleanly instead of allowing it to block the booth.
- Keep listener retries at zero and bound listener upstream timeout to a responsive ceiling.
- Prevent duplicate fallback/recovery calls for a single saturated DJ decision.
- Keep background dossier and track-analysis work asynchronous and deduplicated by the existing Redis locks/signatures.
- Bound prompt/context payloads at the listener boundary to the information needed for the current turn, queue, request line, and recent conversation.
- Preserve cached/fallback copy as a graceful degradation path, but expose the actual fallback state in logs/status rather than presenting it as live LLM work.

## Error handling

- RassyMind `429`, `503`, timeout, or queue-rejection responses are treated as capacity failures, not reasons to launch unbounded retries.
- Listener chat returns the existing concise fallback reply if RassyMind cannot answer within the bound.
- Optional background work records a dropped/deferred result and exits without delaying playback or chat.
- Health checks remain process/readiness checks; completion requires functional chat and status probes.

## Testing and release gates

Before release:

- Add failing unit tests for listener reservation/priority, background shedding, bounded retry behavior, and no duplicate saturation recovery.
- Run radio-controller tests, build, lint, and the existing web smoke tests.
- Validate compose rendering with the Runtipi-managed environment and confirm required RassyMind variables are present without printing secrets.

After release:

- Increment `config.json` to `1.0.22`.
- Build and perform the Runtipi app update/recreate, not merely a local source build.
- Confirm all `web-rassys` containers are healthy and running the new image timestamps/version.
- Probe `/api/healthz`, `/api/radio/status`, `/api/radio/chat`, and a real bounded chat submission.
- Confirm status reports live RassyMind-backed DJ decisions when upstream capacity is available, and that chat remains responsive during background activity.
- Submit a harmless request-line smoke request and verify it is visible with the expected status.
- If the Runtipi upgrade hits the known Docker subnet-overlap failure, stop at the infrastructure blocker and report it rather than claiming deployment success.

## Out of scope

- Rebuilding the entire radio-controller architecture.
- Renaming every historical Cheshire file or internal symbol in this release.
- Changing the music library, Liquidsoap programming model, public branding, or unrelated Runtipi apps.
- Broad UI redesign; only targeted chat responsiveness changes are included if validation proves they are needed.
