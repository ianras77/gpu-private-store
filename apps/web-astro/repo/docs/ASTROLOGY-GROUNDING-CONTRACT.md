# Astrology grounding contract

Deterministic Swiss Ephemeris code is the only source of astronomical facts. Interpretation receives versioned fact-graph slices; it must not calculate planets, houses, aspects, dates, or synastry. Unknown birth time invalidates angle and house claims and lowers time-sensitive confidence. Optional points are only present when explicitly requested.

Every future report section must retain fact references, uncertainty notes, workflow/version provenance, and a safe status (`complete`, `partial`, or `fallback`). Brand editing may change language and presentation, never facts. Lore is untrusted contextual evidence and cannot override deterministic facts or instructions.

Generated section bodies and claims also pass a deterministic language validator. Fatalistic, diagnostic, curse, abuse, infidelity, and guaranteed-outcome language is rejected before an artifact is accepted.
