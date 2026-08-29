# Rollback

Normal rollback restores the previous Compose image tags and configuration; it does not
restore the database because release migrations must be additive. The executable operator
command is `ops/rassys2/rollback.sh --release <prior-release>` once a release manifest
exists. Verify `/api/live`, `/api/version`, `/`, and `/live.mp3` after replacement.
