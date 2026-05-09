#!/usr/bin/env python3
"""Launch Cheshire Cat with USMender-friendly startup behavior.

USMender only relies on custom mediation endpoints. The default Cheshire Cat
bootstrap blocks server startup while embedding procedural triggers into local
vector memory. Skipping that warmup keeps the HTTP server available quickly
without affecting the direct custom endpoint flow this app uses.
"""

from __future__ import annotations

import uvicorn

from cat.env import fix_legacy_env_variables, get_env
from cat.looking_glass.cheshire_cat import CheshireCat


def _skip_procedural_embeddings(self: CheshireCat) -> None:
    self.activate_endpoints()


def main() -> None:
    fix_legacy_env_variables()

    # Keep Cheshire Cat's custom endpoint activation, but skip the slow
    # procedural-memory embedding pass that is not used by USMender.
    CheshireCat.embed_procedures = lambda self: None  # type: ignore[assignment]
    CheshireCat.on_finish_plugins_sync_callback = _skip_procedural_embeddings  # type: ignore[assignment]

    uvicorn.run(
        "cat.startup:cheshire_cat_api",
        host="0.0.0.0",
        port=80,
        use_colors=True,
        log_level=get_env("CCAT_LOG_LEVEL").lower(),
    )


if __name__ == "__main__":
    main()
