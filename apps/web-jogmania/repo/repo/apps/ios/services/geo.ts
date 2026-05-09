export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function elevationGainMeters(points: Array<{ altitude_m?: number | null }>) {
  let gain = 0;
  let lastAlt: number | null = null;
  for (const point of points) {
    const alt = point.altitude_m;
    if (alt == null) continue;
    if (lastAlt != null && alt > lastAlt) {
      gain += alt - lastAlt;
    }
    lastAlt = alt;
  }
  return gain;
}
