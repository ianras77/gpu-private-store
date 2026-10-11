# Web Jogmania

Jogmania turns iPhone and Apple Watch walk and run workouts into replayable adventure courses. HealthKit metrics, GPS shape, climbs, turns, pace changes, and heart-rate pressure become map overlays, hazards, rewards, and world events.

## Runtipi deployment

The Runtipi package runs Jogmania's web app, API, Mastra service, Postgres, Redis, and MinIO services. The iOS client and shared packages remain in the product repository and are not installed as Linux services by Runtipi.

The app's current source is maintained at [github.com/ianras77/web-jogmania](https://github.com/ianras77/web-jogmania). Runtipi builds and runs the Linux services from that repository's checked-out source tree on the host.

## Data and network

Runtipi-managed app data holds Jogmania's persistent database and object storage. The web interface is available on port 3177, the companion API on port 3178, and MinIO on port 3181. Postgres and Redis remain internal to the app stack.

The app is intended to be exposed through Runtipi's configured local domain or a deliberately configured reverse proxy.
