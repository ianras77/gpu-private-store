# Crackstack

Crackstack packages the XLCRACK and TAPECRACK fronts with a shared backend for agentic data work.

## Included services

- XLCRACK on `3212`
- TAPECRACK on `3213`
- Backend API on `3214`
- Internal Postgres, Redis, MinIO, Temporal, and Temporal UI services

## Notes

- The bundled `repo/` directory contains the backend and both web fronts used by this package.
- The frontend talks to the backend over the internal stack network by default.
