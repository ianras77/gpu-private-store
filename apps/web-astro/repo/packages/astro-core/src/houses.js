import { normalizeDegree, interpolateArc } from "./math";
const buildCusps = (start, step) => {
    const cusps = [];
    for (let i = 0; i < 12; i += 1) {
        cusps.push(normalizeDegree(start + step * i));
    }
    return cusps;
};
export const computeWholeSignHouses = (ascendant) => {
    const signStart = Math.floor(normalizeDegree(ascendant) / 30) * 30;
    return {
        system: "whole-sign",
        cusps: buildCusps(signStart, 30),
        ascendant
    };
};
const quadrantCusps = (ascendant, midheaven) => {
    const asc = normalizeDegree(ascendant);
    const mc = normalizeDegree(midheaven);
    const desc = normalizeDegree(asc + 180);
    const ic = normalizeDegree(mc + 180);
    const c1 = asc;
    const c4 = ic;
    const c7 = desc;
    const c10 = mc;
    const c2 = interpolateArc(c1, c4, 1 / 3);
    const c3 = interpolateArc(c1, c4, 2 / 3);
    const c5 = interpolateArc(c4, c7, 1 / 3);
    const c6 = interpolateArc(c4, c7, 2 / 3);
    const c8 = interpolateArc(c7, c10, 1 / 3);
    const c9 = interpolateArc(c7, c10, 2 / 3);
    const c11 = interpolateArc(c10, c1, 1 / 3);
    const c12 = interpolateArc(c10, c1, 2 / 3);
    return [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12].map(normalizeDegree);
};
export const computePlacidusHouses = (ascendant, midheaven) => {
    return {
        system: "placidus",
        cusps: quadrantCusps(ascendant, midheaven),
        ascendant,
        midheaven
    };
};
export const computeHouses = (system, ascendant, midheaven) => {
    if (system === "whole-sign") {
        return computeWholeSignHouses(ascendant);
    }
    return computePlacidusHouses(ascendant, midheaven);
};
const isBetween = (deg, start, end) => {
    const d = normalizeDegree(deg);
    const s = normalizeDegree(start);
    const e = normalizeDegree(end);
    if (s <= e) {
        return d >= s && d < e;
    }
    return d >= s || d < e;
};
export const houseForDegree = (deg, cusps) => {
    if (cusps.length < 12)
        return 1;
    for (let i = 0; i < 12; i += 1) {
        const start = cusps[i];
        const end = cusps[(i + 1) % 12];
        if (isBetween(deg, start, end)) {
            return i + 1;
        }
    }
    return 1;
};
