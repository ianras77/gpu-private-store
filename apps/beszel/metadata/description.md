# Beszel

Beszel runs the node agent for server, disk, GPU, and Docker status reporting on this host.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/beszel`
- Recommended source repo target: `/data/repos/apps/beszel`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `medium`
- The original compose file used host networking. This Runtipi package instead exposes a single explicit agent port while preserving the host-observability mounts the agent needs.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/beszel/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- This is an internal node agent, not a browser UI app.
- Agent traffic stays on `45876` so it can report into the existing Beszel hub without re-keying the node.

- Bind mount `/var/run/docker.sock` -> `/var/run/docker.sock`
- Runtipi app-data mount `${APP_DATA_DIR}/app-data/beszel/named/beszel-agent` -> `/var/lib/beszel-agent`
- Bind mount `/dev/dri` -> `/dev/dri`
- Bind mount `/` -> `/host`
- Bind mount `/proc` -> `/host/proc`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Runtime notes

- This package intentionally preserves the read-only Docker socket and host filesystem mounts because Beszel's job is host observability.
- Node-specific connection settings live in `/data/runtipi/user-config/gpu-private-store/beszel/app.env`.
