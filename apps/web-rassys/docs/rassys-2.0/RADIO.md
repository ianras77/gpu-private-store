# Radio

Existing public compatibility contracts remain `/api/radio/*` and `/live.mp3`. Stream
quality must be reported separately from source quality. Lossless and native hi-res are
not enabled by this change unless their Icecast outputs pass decoder validation.

`/api/radio/manifest` is the single listener-facing quality contract. Native hi-res is
unavailable unless `NEXT_PUBLIC_STREAM_HIRES_URL` is explicitly configured; the API never
pretends that an ordinary stream is native hi-res.

Queue filling is protected by a Redis lease so horizontally scaled controller instances do
not request competing RassyMind decisions or duplicate Liquidsoap queue entries. TTS is not
claimed as active until a renderer and playout acknowledgement are present; current DJ
speech is text/metadata and produced snippets only.
