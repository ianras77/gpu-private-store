# Web Rasies conversion notes

- Strategy: `packaged source with standard media mounts`
- Complexity: `medium`

## Applied

- Kept the source tree inside the app folder and used it directly as the build context
- Replaced node-specific media paths with `${ROOT_FOLDER_HOST}/media`
- Left Cheshire Cat internal while the main site remains the only host-facing service

## Follow-up

- Family-specific domain defaults still live in the application source and can be tuned in future product updates
