# Web experience architecture

`packages/web-experience` owns shared web behavior and brand-aware composition. `packages/brands` owns typed experience data. `packages/ui` owns primitives, chart visualization, report rendering, and CSS foundations. Each `apps/web-*` package remains a thin Next deployment shell for domain, metadata, and brand selection.

The migration is incremental: existing intake, chart, reading, compatibility, and account routes remain intact while their visual shells move into shared components. No route may calculate astrology in the browser or bypass the existing API ownership rules.
