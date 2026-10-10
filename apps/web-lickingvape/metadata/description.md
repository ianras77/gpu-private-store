# Lickingvape

Lickingvape packages a dark anonymous quit-vaping wall, Next.js front end, FastAPI backend, a background worker, Postgres, and Cheshire Cat moderation into one community stack.

## Included services

- Main web UI on `3195`
- API on `3196`
- Internal Postgres and a Cheshire Cat moderation service
- Background worker for automation and publishing workflows

## Notes

- The web UI proxies API traffic internally, so the main app can stay on one Runtipi entrypoint.
- The web, API, and worker images build from the canonical [Lickingvape GitHub repository](https://github.com/ianras77/web-lickingvape).
- Postgres and Cheshire Cat data persist in Runtipi app-data; configuration secrets remain in Runtipi user configuration.
