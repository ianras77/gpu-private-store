# Mr Rassy artifacts

Artifacts are derived, reviewable outputs. They never replace authoritative
radio playback state, DM state, Minecraft events, authored Markdown, family
media, or recorded story files.

The shared runtime schema is `packages/mr-rassy-core/src/index.ts`. Every
artifact identifies its channel, status, generation run when available, and
source references. Generated content stays draft/review/private until the
existing channel approval policy explicitly publishes it.

Current kinds include `booth-note`, `trackbook`, `setbook`,
`dm-session-recap`, `campaign-chronicle`, `minecraft-chronicle`,
`story-draft`, `story-transcript`, `family-memory`, `notebook-draft`, and
`home-opening`.

Admin-generated notebook/thought drafts now persist a `notebook-draft`
artifact referencing the canonical thought after the existing authored write.
Artifact persistence failure is observable but does not roll back the authored
thought, preserving the notebook's existing availability contract.
