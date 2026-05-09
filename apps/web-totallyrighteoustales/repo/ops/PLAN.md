# Compliance Plan: web-totallyrighteoustales

## Planned/Applied Changes
- Ensure `ops/ports.yaml` exists with inferred service ports.
- Ensure `ops/health/HEALTH.md` exists and documents `/healthz`.
- Ensure `.dockerignore` exists with baseline ignores.
- Ensure `Dockerfile` exists (baseline Node multi-stage if missing).
- Ensure `.env.example` exists (minimal baseline if missing).
- Ensure `README.md` exists (minimal runbook if missing).

## Risks
- Inferred ports may differ from actual runtime wiring.
- Some apps are monorepos; top-level Dockerfile may need custom context.
- Existing app code may not expose `/healthz` without additional changes.

## Inferred Ports
- web: 3010
- api: 4000

## Status
- Scaffolding applied. Run `ops/verify-all.sh` for runtime validation.
