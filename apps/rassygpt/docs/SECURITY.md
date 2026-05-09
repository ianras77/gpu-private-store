# Security Notes

- Keep `RASSYGPT_REQUIRE_AUTH=true` for all `/v1` API usage.
- Use a long generated RassyGPT API key.
- Expose only the gateway through Runtipi/Traefik.
- Keep Qdrant internal unless another trusted Runtipi service needs direct access.
- Consider adding Authentik/Authelia in front of the dashboard route if this is internet-exposed.
- The default gateway does not store prompts. Backend services may log startup/model events.
