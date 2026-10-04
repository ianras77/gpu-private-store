const MIN_LIBRARY_SCAN_FRESHNESS_MS = 15 * 60 * 1000;

export function isLibraryScanRecent(
  scannedAt: number | null,
  now: number,
  refreshSeconds: number,
): boolean {
  if (
    typeof scannedAt !== "number" ||
    !Number.isFinite(scannedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(refreshSeconds) ||
    refreshSeconds <= 0
  ) {
    return false;
  }

  const ageMs = now - scannedAt;
  const allowedAgeMs = Math.max(
    MIN_LIBRARY_SCAN_FRESHNESS_MS,
    refreshSeconds * 12 * 1000,
  );
  return ageMs >= 0 && ageMs < allowedAgeMs;
}
