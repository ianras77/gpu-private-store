# Chart fact graph

`@astro/astro-analysis` owns the first versioned graph contract. `buildChartFactGraph` emits reproducible IDs from placements, angles, houses, aspects, and uncertainty metadata. Its output is the intended boundary between calculation and interpretation and is safe to cache by chart hash, calculation version, analysis version, and astrology profile.

Chart metadata also records explicit optional-point selection (`northNode`, `chiron`) so enabling a point cannot silently collide with older cached charts.
