# BAT

BAT packages the public/editorial web UI, orchestration API, background worker, social publisher, Qdrant, Postgres, Redis, and Cheshire Cat into one install.

## Included services

- Main web UI on `3197`
- API on `3198`
- Internal Qdrant, Postgres, Redis, social publisher, and Cheshire Cat services

## Notes

- Cheshire Cat is wired to the shared Ollama services on the main Runtipi network.
- SQL bootstrap assets and Docker build contexts are bundled inside this app directory for portable installs.
