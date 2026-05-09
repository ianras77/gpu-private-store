# Beszel conversion notes

- Strategy: `auto-with-manual-review`
- Complexity: `medium`

## Notes

- Host networking was removed in favor of a single published agent port.
- The Docker socket and read-only host mounts are intentionally preserved for observability.
- Agent state now lives under Runtipi app-data instead of `/var/lib/beszel-agent`.
