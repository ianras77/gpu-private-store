# UX rebuild baseline

The five Next applications currently expose the same route inventory and duplicate their page structure. Before this cycle, the home pages were effectively identical 256-line implementations, the shared CSS centered every surface around rounded translucent cards, and `BrandThemeProvider` mutated document variables from `useEffect`. Brand configuration primarily carried colors, fonts, and copy.

The existing chart, intake, compatibility, account, reading, authentication, API, RassyMind, Mastra, saved-data, and deployed `guideSections` behavior are preserved. The UX work is therefore a shared experience migration, not a domain or calculation rewrite.

This cycle establishes `packages/web-experience` as the shared web surface, adds a typed brand experience system with five layout variants, replaces the five duplicated home entrypoints with thin wrappers, makes the base theme server-renderable through inline variables, removes the global automatic dark-mode declaration, and adds responsive/accessibility/print foundations. Remaining route migrations are tracked in `docs/UX-QUALIFICATION.md`.
