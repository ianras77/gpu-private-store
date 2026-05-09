export function computeHotScore(score: number, createdAt: Date) {
  const ageHours = (Date.now() - createdAt.getTime()) / 36e5;
  const sign = score === 0 ? 0 : score > 0 ? 1 : -1;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const ageFactor = ageHours / 36; // tuned constant; lower is slower decay
  return order + sign * ageFactor;
}
