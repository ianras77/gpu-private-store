# Rassy Online

Rassy Online is the Runtipi-native web interface for RassyCodex. It is designed as a public ChatGPT-style portal for `rassy.online`, with anonymous chat, registered-user history, per-user document libraries, user-scoped vector retrieval, and admin controls.

This package is built for the custom GPU private appstore. It runs as a normal Runtipi app with a public web service and private Postgres/Qdrant support services. The web container reaches the standalone RassyCodex gateway through `host.docker.internal:8844`.

Stage 1 provides the installable app skeleton, health route, and visual workbench shell. Later stages add auth, chat persistence, RassyCodex streaming, document ingestion, vector retrieval, and the admin console.
