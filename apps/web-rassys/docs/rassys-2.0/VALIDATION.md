# Validation

Required gates are `npm ci`, `npm run format`, `npm run lint`, `npm test`, `npm run build`,
Compose config validation, image build, route smoke tests, and decoded stream checks.
This repository currently has per-package npm lockfiles rather than a checked-in pnpm
workspace; package-manager consolidation is a follow-up P0 change and must not silently
invalidate the Runtipi build contract.
