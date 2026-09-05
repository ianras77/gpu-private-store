# Channels

The shared registry in `packages/mr-rassy-core/src/index.ts` defines `mr-rassy`,
`dungeon-master`, `minecraft`, `stories`, `family`, `notebook`, `home` and
`admin`, including aliases, visibility, agents, tools and artifact kinds.
Callers must resolve policy from this registry rather than reconstructing it.
