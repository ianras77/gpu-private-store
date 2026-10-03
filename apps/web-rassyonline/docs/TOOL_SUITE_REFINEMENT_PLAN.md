# Tool Suite and Renderer Refinement Plan

## Outcome

Make Rassy Online's tools easy for the model to select, safe to execute, and
useful to a person reading the resulting response. Every visual output must
remain legible on the product's black canvas and every numerical claim must
retain meaningful precision.

## 1. Capability and call-path audit

- Inventory the tool registry, per-agent availability, schemas, descriptions,
  stream event names, and capability gate.
- Make contracts concrete enough that the model can supply valid arguments.
- Preserve fail-closed model capability checks; qualify an unavailable model
  instead of pretending a tool call succeeded.
- Add regression coverage for discovered call-path and serialization failures.

## 2. Tool quality

- Complete the declared chart surface or narrow the contract to actual support.
- Make matrix workflows explicit: inverse, multiply, solve, and symmetric-only
  spectral analysis must not be conflated.
- Keep calculator parsing safe and use it as the numeric source of truth.
- Audit research, document, time, ASCII, and dot-matrix tools for bounded,
  provenance-preserving behavior.

### Eleven connective toolkit improvements

1. Give every routed assistant that can safely use a visual or numeric tool a
   real registry entry, including the fast utility lane.
2. Add deterministic per-turn tool guidance so the model knows when a tool is
   useful and the exact matrix/vector contract it must satisfy.
3. Require live tool capability metadata for every lane, including utility,
   before opening a tool-capable stream.
4. Normalize provider tool-name variants before classifying research activity.
5. Surface tool failures as a bounded actionable stream event rather than
   losing the failure inside provider output.
6. Deduplicate replayed tool artifacts and cap a turn at twelve artifacts.
7. Complete the chart contract with bar, line, scatter, and pie renderers.
8. Add safe series analysis: descriptive statistics, normalization, cumulative
   totals, moving averages, and percent change; each result is chart-ready.
9. Preserve label/value pairing at every data boundary and reject invalid pie
   series before rendering.
10. Make mathematical matrix work explicit: solve, inverse, multiplication,
    and symmetric-only spectra are separate operations with correct inputs.
11. Keep artifacts after the explanation and on one black visual canvas so
    tool output reads as grounded supporting material rather than disconnected
    cards.

## 3. Renderer and visual language

- Use a single black artifact canvas; never allow a sanitizer or nested surface
  to reintroduce a white panel.
- Ensure sanitized SVG relies on application CSS, not stripped SVG style nodes.
- Use adaptive number formatting and tabular alignment for numbers.
- Support every chart type advertised to the model, with accessible labels and
  safe empty-data states.

### Eleven renderer passes

1. Replace white nested math and dot-matrix canvases with the black product
   canvas.
2. Remove the competing red offset-shadow treatment from generated artifacts.
3. Establish a single caption hierarchy and muted monospace metadata style.
4. Apply tabular numeric styling and preserve meaningful tiny/huge values.
5. Normalize matrix number precision and align matrix cells around a stable
   center line.
6. Make bar, line, scatter, and pie charts use the same dark visual language.
7. Move Math Lab styling into app CSS because sanitizer-safe SVG cannot retain
   embedded style nodes.
8. Put explanatory prose before artifacts, preserving the answer-to-evidence
   reading order.
9. Add explicit labels, tooltip titles, and accessible SVG roles to chart and
   math output paths.
10. Add bounded fallback/error behavior for unsafe SVG, empty pie data, and
    missing numeric values.
11. Tighten narrow-screen spacing, chart heights, border contrast, and the
    final visual artifact surface after a source-build browser pass.

### Eleven math-tool improvements

1. Reject empty and ragged matrices before any matrix operation.
2. Give every square-only operation an explicit square-matrix precondition.
3. Validate both operands for multiplication, not just the left dimensions.
4. Bound determinant work to the advertised 8 by 8 envelope.
5. Preserve meaningful tiny and huge matrix values with adaptive notation.
6. Separate direct solve input (`vectorB`) from matrix multiplication input
   (`matrixB`) in the tool contract.
7. Verify linear-system answers with a displayed Euclidean residual.
8. Add pivoted reduced-row-echelon form for rank-revealing row reduction.
9. Return rank with RREF rather than leaving the model to infer it visually.
10. Add bounded integer matrix powers using exponentiation by squaring.
11. Expand tests across solve residuals, rank, powers, spectra, and failure
    behavior so the model receives stable tool semantics.

## 4. Qualification

- Run focused unit tests, the full web suite, type-check, and production build.
- Inspect the final diff against the dirty worktree so unrelated work remains
  untouched.
- Report source verification separately from managed rebuild, browser proof,
  and live capability qualification.
