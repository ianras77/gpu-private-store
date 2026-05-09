# App Store Status

This file tracks the live state of the current custom Runtipi appstore in this folder.

## Current canonical app ids

- `beszel`
- `crewai`
- `langflow`
- `learning-airflow`
- `learning-label-studio`
- `learning-minio`
- `learning-mlflow`
- `learning-qdrant`
- `learning-wandb`
- `ollama`
- `openclaw-bridge`
- `tika`
- `web-astro`
- `web-bat`
- `web-crackstack`
- `web-jogmania`
- `web-lickingvape`
- `web-rasies`
- `web-rassyapp`
- `web-rassys`
- `web-totallyrighteoustales`
- `web-usmender`

## Current package status

- Self-contained and Runtipi-aligned in this repo: `crewai`, `langflow`, `learning-label-studio`, `learning-mlflow`, `learning-wandb`, `ollama`, `openclaw-bridge`, `tika`, `web-jogmania`, `web-rasies`, `web-rassyapp`, `web-totallyrighteoustales`, `web-usmender`
- Already current and left in place after audit: `beszel`, `learning-airflow`, `learning-minio`, `learning-qdrant`, `web-astro`, `web-bat`, `web-crackstack`, `web-lickingvape`
- Current package with an external legacy dependency that still exists outside the appstore: `web-rassys`

## Cleanup completed

- Legacy package folders removed from the live appstore tree: `apps`, `astro`, `blondesagainsttrump`, `crackstack`, `learning`, `lickingvape`, `web-rassy`
- Current package-local dev residue such as `.env`, `node_modules`, `.venv`, `.pytest_cache`, `.next`, `__pycache__`, backup files, and `MIGRATION-SOURCE.txt` has been removed from the active app folders.

## Notes

- Current packages no longer rely on legacy external source roots in their active `docker-compose.yml`, `config.json`, `metadata/description.md`, or `conversion-notes.md`.
- `web-rassys` may still need `HOST_MUSIC_SYMLINK_ROOT` set if the live media library still depends on an absolute host-side music symlink root.
