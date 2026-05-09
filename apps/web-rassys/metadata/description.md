# Rassys

Rassys packages the public site, live radio stack, Minecraft bridge, Cheshire, Icecast, Liquidsoap, Redis, and Postgres into one install.

## Included services

- Main site on `3187`
- Icecast stream on `3188`
- Internal radio-controller, Cheshire, Redis, and Postgres services
- Minecraft bridge and Liquidsoap services for live site features

## Notes

- Media libraries are mounted from the Runtipi media directory and stay outside container state.
- The bundled app source includes the site, radio controller, bridge services, and infrastructure assets used to build the stack.
