# Dungeon Master migration

DM transport uses a Mastra orchestration pass: requests are routed to the rules
scholar and/or world keeper for advisory context, then the registered Dungeon
Master produces the final proposal. Existing campaign locks, idempotency, dice,
patch validation and transactional persistence stay authoritative in the DM
service. Specialist output is advisory and cannot mutate campaign state.

The transport returns delegation status for operator diagnostics while keeping
the public response compatible with the existing DM client. The remaining
release gate is live qualification against the authenticated campaign flow,
including persistence and failure fallback.
