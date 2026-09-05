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
- Add chart interaction tests and live chart endpoint/browser qualification with a real saved chart.
- Upgrade Next/React only after a separate compatibility qualification; current Next 14 builds remain green.
- Run browser screenshot matrix at 390, 768, and 1440 widths.
- Qualify live Runtipi branded endpoints after the deployment runtime is healthy.
