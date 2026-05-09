# Rassy LocalAI

LocalAI provides a private OpenAI-compatible API and built-in web UI for installing and managing local models.

This app is pinned to the current LocalAI `v4.1.3` NVIDIA CUDA 12 image and is preconfigured to use the host Tesla M40:

- `GPU-787cf3b9-e1d7-1712-bd12-60cf740bade8`
- `Tesla M40 24GB`
- Compute capability `5.2`

Persistent app data:

- `/models` stores LocalAI models and gallery downloads.
- `/config` is reserved for LocalAI configuration files.
- `/tmp/localai` is backed by persistent app cache storage.

The installer generates a LocalAI API key automatically. Keep the app internal unless you intentionally expose it through Tipi.

## Swarm mode

This app starts LocalAI as the M40 swarm entrypoint:

- P2P is enabled with `LOCALAI_P2P=true`.
- Federated mode is enabled by default for load-balanced peer sharing.
- LocalAI generates the P2P token at startup. Copy the generated `TOKEN` value from the app logs when joining workers.
- The network ID defaults to `rassylocalgpt-m40-master`.
- LAN-only discovery is enabled to avoid DHT/QUIC startup crashes in LocalAI's P2P stack.
- Host networking is enabled because LocalAI requires it for containerized P2P discovery.

After install, open LocalAI and use the Swarm section to copy the join instructions for any peer or worker machines.
