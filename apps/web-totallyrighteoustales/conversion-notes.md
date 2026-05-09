# Web Totallyrighteoustales conversion notes

- Strategy: `validated-with-data-copy`
- Complexity: `medium`

## Current migration stance

- The package keeps the product monorepo intact in `/data/repos/apps/web-totallyrighteoustales`, including `apps/ios`, while packaging only the Linux-hosted web, API, worker, Postgres, Redis, and Cheshire Cat services into Runtipi.
- The direct host-facing port block is intentionally aligned as:
  - web UI on `3190`
  - API on `3191`
- Postgres, Redis, and Cheshire Cat are not published on host ports in the Runtipi package.
- The package reads its build context and the Cheshire bootstrap helper directly from `/data/repos/apps/web-totallyrighteoustales` so the store remains a thin packaging layer.

## Manual follow-up

- If Supabase-backed auth is required, provide real `TRT_SUPABASE_*` values and rebuild the app so the web bundle picks up the matching `NEXT_PUBLIC_*` values.
- If S3-backed uploads are required, provide real `TRT_S3_*` values before testing image upload flows.
