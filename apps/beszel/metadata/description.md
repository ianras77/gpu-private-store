# Beszel

Beszel reports this host's CPU, memory, network, sensors, OS and data disks, ZFS pool health, NVIDIA GPUs, and Docker containers to the existing hub.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/beszel`
- Recommended source repo target: `/data/repos/apps/beszel`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `medium`
- Beszel needs the host network namespace to report the server's real network interfaces. This package uses host networking and listens directly on port `45876`, without Runtipi or Traefik routing.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/beszel/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- This is an internal node agent, not a browser UI app.
- The agent listens on `45876` and reports into the existing Beszel hub without re-keying the node.

- Bind mount `/var/run/docker.sock` -> `/var/run/docker.sock`
- Runtipi app-data mount `${APP_DATA_DIR}/app-data/beszel/named/beszel-agent` -> `/var/lib/beszel-agent`
- Bind mount `/dev/dri` -> `/dev/dri`
- Bind mount `/` -> `/host`
- Bind mount `/proc` -> `/host/proc`
- Bind mounts `/dev/nvme0` and `/dev/nvme0n1` for NVMe disk health reporting; `SMART_DEVICES` selects the NVMe controller explicitly.
- Bind mount `/dev/zfs` -> `/dev/zfs` and use `zpool` and `zfs` helper wrappers from `${APP_DATA_DIR}/zfs-tools` to run the host's ZFS tools through the read-only `/host` view.
- Bind mounts `/data`, `/backup`, `/models`, `/models-fast`, and `/mnt/cannonball` under `/extra-filesystems` so Beszel can report each mounted volume's usage.
- Use `FILESYSTEM=sda2__OS` so root disk charts track the OS partition instead of the most active data disk.
- Use `SYS_SENSORS=/host/sys/class/hwmon` to read host temperature and fan sensors.
- NVIDIA runtime reservation exposes all host GPUs to the agent with the `utility` capability.
- GPU telemetry is collected with `nvidia-smi` so Beszel can report GPU usage, memory, temperature, and power draw.

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Runtime notes

- This package intentionally preserves the read-only Docker socket and host filesystem mounts because Beszel's job is host observability.
- Node-specific connection settings live in `/data/runtipi/user-config/gpu-private-store/beszel/app.env`.
