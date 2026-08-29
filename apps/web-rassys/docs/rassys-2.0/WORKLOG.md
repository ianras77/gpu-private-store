# Rassys 2.0 worklog

- Base SHA: `d00be126919808d80866f944930db017b85baf84`
- Branch: `codex/rassys-2.0`
- Canonical Compose: `docker-compose.yml` (Runtipi-generated deployment consumes this file).
- Preflight patch: `/tmp/web-rassy-pre-rassys2-20260829T012026Z.patch`
- Completed: repository survey; canonical app registry/routes; launcher homepage; compatibility redirects; `/api/live`, `/api/ready`, `/api/version`; liveness healthcheck; removed radio TLS bypass.
- Deployment status: not deployed. The local Compose project is not running; managed mirror/runtime convergence must be established before claiming production.
- Known blockers: no active local web-rassys Compose containers; no production environment file was exposed to this checkout; full release features remain to be migrated incrementally.
- Rollback target: base SHA above until a release manifest is created.
