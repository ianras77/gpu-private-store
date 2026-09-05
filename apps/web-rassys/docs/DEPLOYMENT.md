# Deployment

The release order is: scoped source validation, image/build checks, managed
backup, Runtipi update, migrations, health checks and user-flow smoke. The
current source Compose adds `rassy-intelligence`; the managed mirror remains
on the prior release until the backup gate succeeds.

Web and radio now default their canonical `RASSYMIND_BASE_URL` to the
authenticated host gateway (`http://host.docker.internal:8844`). Cheshire is
still separately wired only for the documented compatibility fallback and is
not the preferred model route.

The migration proving switch is `RASSY_INTELLIGENCE_REQUIRE_CANONICAL=true`.
It makes web and radio compatibility calls fail closed so a staging run can
qualify the canonical path before Cheshire is removed.
