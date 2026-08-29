# Deployment

From the managed Runtipi app checkout, validate with:

```sh
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml build web radio-controller
```

Runtipi owns the generated environment and service lifecycle. Do not run this source
checkout with an empty environment: `ROOT_FOLDER_HOST`, `APP_STORE_ID`, media mounts,
database credentials, and service secrets are required at runtime.

Deploy immutable image references and verify `/api/live`, `/api/version`, and the public
routes after Runtipi recreation. Keep the previous image tag and release manifest.
