# Lickingvape

Lickingvape packages a Next.js community front end, FastAPI backend, background worker, Postgres, and Cheshire Cat into one editorial stack.

## Included services

- Main web UI on `3195`
- API on `3196`
- Internal Postgres and Cheshire Cat services
- Background worker for automation and publishing workflows

## Notes

- The web UI proxies API traffic internally, so the main app can stay on one Runtipi entrypoint.
- The bundled `repo/` directory contains the source used to build the web, API, and worker images.
