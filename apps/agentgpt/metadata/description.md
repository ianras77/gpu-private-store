# AgentGPT

AgentGPT is packaged here as a RunTipi-native stack: a Next.js web UI, the upstream FastAPI platform service, and a local MySQL database.

## Included in this package

- AgentGPT web UI on the main app URL
- Internal FastAPI platform service proxied through the same origin at `/platform`
- Local MySQL 8 database with persistent data under `${APP_DATA_DIR}/app-data/agentgpt/named/mysql`
- Passworded local sign-in flow for self-hosted use
- A bundled `files` tool that can read and search the mounted RunTipi filesystem from inside AgentGPT

## Mounted paths inside the platform container

- `/runtipi` -> full RunTipi host root (read-only)
- `/workspace` -> app-owned persistent workspace under `${APP_DATA_DIR}/app-data/agentgpt/named/workspace` (read-write)

## Notes

- The `files` tool is enabled by default the first time you open the app. It can list directories, read text files, find files by glob, and search text inside mounted files.
- The platform container is attached to the RunTipi main network so it can reach other internal services by container name when future tooling or custom integrations need them.
- OpenAI API base/key, Serper, and Replicate settings are optional; if you leave them blank, AgentGPT can still prompt for a user API key in the UI.
