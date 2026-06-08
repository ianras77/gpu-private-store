# Mr Rassy Home And Station Hardening

Approved direction: keep the homepage visually intact, make the first screen lighter, and make the radio station feel more produced without replacing the existing controller/Liquidsoap design.

## Scope

- Reduce home page wakeups by backing off noncritical polling and avoiding eager audio preload.
- Cache repeated full archive note reads briefly so `/radio/notes` renders do not repeatedly hit the controller for 120-note payloads.
- Make station IDs and bumpers play as short 2-5 second cuts by default.
- Allow occasional bumper clusters of up to three snippets before music returns.
- Increase produced transition opportunities and attach richer Liquidsoap metadata for curves, cue points, and short handoffs.
- Keep Mr Rassy engaged with smaller 5-song LLM planning windows and a 60 second controller timeout for local model latency.
- Harden Liquidsoap queue reconciliation so normal metadata text such as "Unknown Pleasures" is not mistaken for a telnet error.
- Preserve learned station data while rebuilding disposable catalog cache tables that are failing to persist.
- Bump the Runtipi app version, sync the installed copy, rebuild, restart, and verify live HTTP/container health.

## Runtime Data Boundary

The live rebuild may truncate and repopulate only catalog cache tables:

- `LibraryTrack`
- `LibrarySnippet`
- `LibraryPodcastSeries`
- `LibraryPodcastEpisode`

It must preserve learned and historical station tables such as `LibraryTrackInsight`, `DjScript`, and `PlayLog`.
