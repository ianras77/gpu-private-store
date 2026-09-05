# Rassys / Mr Rassy

Rassys is the personal site, radio, Minecraft, stories, family and notebook
stack. The application source is this `web-rassys` app-store subtree. Its
intelligence migration is implemented in `services/rassy-intelligence`, with
RassyMind as the model gateway and existing domain services remaining
authoritative.

Run the workspace checks with `pnpm install --frozen-lockfile`, followed by
`pnpm run lint:web`, `pnpm run test:radio`, and the build scripts. Production
deployment is managed by Runtipi; see `docs/DEPLOYMENT.md` and
`docs/QUALIFICATION.md`.
