# Mastra memory and storage

The intelligence service now registers `@mastra/pg` `PostgresStore` against
the existing Postgres database in the dedicated `rassy_mastra` schema by
default. Runtime uses `disableInit: true`; schema creation is an explicit
release operation through `pnpm --filter rassy-intelligence storage:init` after
backup and against the intended database.

This storage is for Mastra threads, messages, workflow state, and observability
metadata. It does not replace authoritative DM, radio, Minecraft, Markdown,
family-media, or story tables/files. Resource/channel privacy boundaries must
be enforced in request context before memory is added to an agent call.

The production migration remains gated until a restored production-like
Postgres volume has been initialized and rollback tested.
