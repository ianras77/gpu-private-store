# Tools

`web-search` uses configured SearXNG with bounded results. `document-search` embeds through
`rassy-embed`, filters by authenticated user and selected ready documents, and falls back to
vector order if `rassy-rerank` is unavailable. Both are read-only.
