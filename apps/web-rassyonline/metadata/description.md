# Rassy Online

Rassy Online is the Runtipi-native web interface for RassyMind. It is designed as a minimal, magical chat portal for `rassy.online`, with anonymous chat, registered-user history, per-user document libraries, user-scoped vector retrieval, and explicit web-resource search through `search.rasies.com`.

Rassy Online does not expose image generation; it focuses on chat, documents, retrieval, and web context.

This package is built for the custom GPU private appstore. It runs as a normal Runtipi app with a public web service and private Postgres/Qdrant support services. The web container reaches the standalone RassyMind gateway through `host.docker.internal:8844`, using the canonical `rassy-mind`, `rassy-code`, `rassy-fast`, `rassy-utility`, and `rassy-embed` aliases.

The default screen is the chat itself: model mode, web-search policy, atmosphere, and document memory are compact controls around the conversation instead of a landing page or feature checklist.
