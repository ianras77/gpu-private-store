import { shortestArc } from "./math";
const ASPECT_DEGREES = {
    conjunction: 0,
    opposition: 180,
    trine: 120,
    square: 90,
    sextile: 60
};
const DEFAULT_ORBS = {
    conjunction: 8,
    opposition: 8,
    trine: 6,
    square: 6,
    sextile: 4
};
export const detectAspects = (points, orbs = {}) => {
    const result = [];
    const orbConfig = { ...DEFAULT_ORBS, ...orbs };
    for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        if (!a)
            continue;
        for (let j = i + 1; j < points.length; j += 1) {
            const b = points[j];
            if (!b)
                continue;
            const separation = shortestArc(a.degree, b.degree);
            for (const aspect of Object.keys(ASPECT_DEGREES)) {
                const exact = ASPECT_DEGREES[aspect];
                const diff = Math.abs(separation - exact);
                const orb = orbConfig[aspect];
                if (diff <= orb) {
                    result.push({
                        type: aspect,
                        between: [a.key, b.key],
                        orb: diff,
                        exact
                    });
                    break;
                }
            }
        }
    }
    return result.sort((a, b) => a.orb - b.orb);
};
