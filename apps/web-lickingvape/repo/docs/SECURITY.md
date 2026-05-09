# Security

## Threat model
Primary risks:
- Public submission abuse (spam, harassment, PII leakage)
- Unauthorized access to internal tooling (post creation, theme updates)
- Credential leakage (Twilio auth token, internal tool tokens, Cat API keys)

## Controls
- Twilio signature validation for inbound SMS.
- Rate limiting per phone hash.
- Internal tool endpoints require `X-Internal-Token`.
- Admin endpoints require `X-Admin-Token` when `ADMIN_TOKEN` is set.
- Consider mTLS or network-level ACLs to ensure internal tool endpoints are not reachable publicly.
- Cheshire Cat tools are scoped to the API tool endpoints only.
- Audit logging for every automated or admin action.
- Phone numbers are stored as HMAC hashes, not raw values.

## Operational guidance
- Keep internal endpoints private via network controls and never expose the token publicly.
- Rotate `INTERNAL_TOOL_TOKEN` if leakage is suspected.
- Rotate `ADMIN_TOKEN` if leakage is suspected.
- Store secrets in your platform secret manager.
- Review audit log regularly for unexpected actions.
