# Deploy

## Reverse proxy
Terminate TLS and route traffic to the web and API containers.

Example routing:
- `/` -> web (port 3000)
- `/api/*` -> api (port 8000)

If you use a proxy, set:
- `PUBLIC_BASE_URL=https://your-domain`
- `WEB_ORIGIN=https://your-domain`
- `API_PROXY_TARGET=http://api:8000`

## HTTPS
Use a managed certificate (Caddy, Nginx + certbot, or your platform’s TLS).

## Backups
Postgres data lives in the `db_data` volume. Snapshot or dump regularly:
- `pg_dump` from the `db` container
- or volume-level backups via your host

## Cheshire Cat
Expose Cheshire Cat admin UI only to trusted admins or internal networks.
