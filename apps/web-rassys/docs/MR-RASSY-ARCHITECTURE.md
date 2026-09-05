# Mr Rassy architecture

Next.js owns public UX, authentication and compatibility routes. The Mastra
runtime in `services/rassy-intelligence` owns agent registration, channel
policy and model calls. RassyMind is the only configured model gateway.
Radio, DM, Minecraft and media services remain deterministic authorities.

The current migration is additive: typed intelligence callers and the
canonical channel endpoint coexist with Cheshire fallbacks until live parity,
backup and rollback gates pass.
