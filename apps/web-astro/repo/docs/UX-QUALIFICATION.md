# UX qualification

## Passed in this cycle

- Brand experience configuration added for all five brands.
- Shared `@astro/web-experience` package builds.
- Five home entrypoints reduced to thin wrappers.
- Five web applications build successfully.
- Server-rendered theme variables no longer depend on a client effect.
- Automatic `light dark` color-scheme declaration removed.
- Shared focus, reduced-motion, mobile-width, print, and overflow foundations added.
- Shared birth-chart experience now provides the visual wheel stage, focus layers, Big Three, element/modality meters, placement index, and time-unknown messaging for all five brands.

## Remaining

- Migrate intake, chart, reading, compatibility, and account shells to shared components.
- Add chart interaction tests and live browser qualification with a real saved chart.
- Upgrade Next/React only after a separate compatibility qualification; current Next 14 builds remain green.
- Run browser screenshot matrix at 390, 768, and 1440 widths.

## Live chart and brand smoke qualification (2026-09-05)

- API health returned `{"ok":true}` on the recreated Runtipi stack.
- Known-time `/v1/chart/natal` returned 16 points, six house cusps, and 17
  aspects with North Node and Chiron requested.
- Unknown-time `/v1/chart/natal` returned no houses, preserving the safe
  unknown-time behavior.
- All five chart pages returned HTTP 200 and server-rendered the correct brand
  identity: Jupiterseek, Malefic Me, Saturn Leo, Saturnseer, and Oracle Veil.
- All five web containers reached healthy state after building `ui`,
  `web-experience`, and the individual Next app from the shared workspace.

The remaining qualification is browser screenshot and interaction coverage for
intake, report, compatibility, and account routes.
