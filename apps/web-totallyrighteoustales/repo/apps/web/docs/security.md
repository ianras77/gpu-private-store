# Security Notes

- Secrets: `.env` is gitignored. Populate `apps/web/.env` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL`. Do **not** commit secrets; use `.env.example` as the template.
- Auth: Web uses Supabase JWT (magic link). API base URL is read from `NEXT_PUBLIC_API_URL`; ensure HTTPS in production.
- Content sanitization: `sanitize-html` is used when rendering user stories. Keep the allowed tags list aligned with moderation rules.
- Headers: Deploy behind a proxy that adds security headers (CSP, HSTS, X-Frame-Options). Next middleware not configured yet—consider `next-safe-middleware` for CSP/report-only.
- Dependency checks: run `pnpm audit` regularly; prioritize high-severity findings on `next`/`react` runtime and Supabase client.
- Rate limiting / abuse: API rate limiting handled server-side (Fastify). Web relies on API responses; if exposing preview/edge routes, add middleware guardrails.
