# Architecture

Rassys is a Runtipi-managed multi-service application. `apps/web` owns the public shell
and proxies existing API contracts. Radio, Minecraft, Redis, PostgreSQL, Liquidsoap,
Icecast, and optional AI remain separate services. The registry in
`apps/web/src/config/apps.ts` is the source for public application navigation.

Optional applications must degrade independently; `/api/live` never calls downstream
services. The existing audio provider remains shared by the shell while legacy endpoints
stay available for mobile compatibility.
