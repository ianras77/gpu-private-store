# Astro Multibrand

Astro Multibrand packages one shared astrology backend with five branded web fronts: Jupiterseek, Maleficme, Saturnleo, Saturnseer, and Oracleveil.

## Included services

- Shared API on `3200`
- Main branded front on `3201`
- Extra branded fronts on `3202` through `3205`
- Postgres, Redis, and Qdrant for state, cache, and lore retrieval

## Notes

- The bundled `repo/` directory is the source of truth for this Runtipi package.
- Esoterica reference content is mounted from `${ROOT_FOLDER_HOST}/media/data/books/2-Collections/Esoterica`.
