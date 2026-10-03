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

- Continue consolidating route-specific intake, reading, and account presentation into shared components.
- Expand chart interaction and report browser coverage; the compatibility Atlas is currently qualified with mocked HTTP responses at the browser boundary and real API calls in isolated local qualification.
- Upgrade Next/React only after a separate compatibility qualification; current Next 14 builds remain green.
- Capture a visual screenshot review at 390, 768, and 1440 widths.

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

## Rework update (2026-10-03)

- All five home pages use their brand's typed world and visual language; chart pages share the interactive observatory, visual wheel, planetary index, and unknown-time treatment.
- Intake, chart, reading, primary navigation, and compatibility Atlas passed the 15-case Playwright suite against fresh local builds across all five brands.
- The signed-in compatibility flow now executes the durable Mastra relationship workflow and renders its report as an Atlas. All five brand browser projects passed this flow.
- A mobile-width home check passes at 390 pixels for all five brand apps.
- A screenshot comparison pass and physical mobile-device review have not been completed.
