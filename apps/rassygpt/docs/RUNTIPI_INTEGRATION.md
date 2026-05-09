# Runtipi Integration

RassyGPT follows the current Runtipi dynamic compose app structure:

```text
apps/rassygpt/config.json
apps/rassygpt/docker-compose.yml
apps/rassygpt/metadata/description.md
apps/rassygpt/metadata/logo.jpg
```

The main service is `rassygpt-gateway`, declared with:

```yaml
x-runtipi:
  is_main: true
  internal_port: 8080
  add_to_main_network: true
```

The gateway is the only public service. Backends are internal, with Qdrant optionally attached to the Runtipi main network for trusted service-to-service connections.

## Connect other Runtipi apps

Use:

```text
OPENAI_BASE_URL=https://YOUR-RASSYGPT-DOMAIN/v1
OPENAI_API_KEY=YOUR_RASSYGPT_API_KEY
```

For internal Docker-network calls from another Runtipi app, use the Traefik URL or attach that service to the main network and call the gateway by service name if your Runtipi network policy allows it.
