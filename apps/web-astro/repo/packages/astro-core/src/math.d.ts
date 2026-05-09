export declare const ZODIAC_SIGNS: readonly ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];
export declare const normalizeDegree: (deg: number) => number;
export declare const degreeToSign: (deg: number) => ZodiacSign;
export declare const degreeToSignDegree: (deg: number) => number;
export declare const shortestArc: (degA: number, degB: number) => number;
export declare const interpolateArc: (start: number, end: number, t: number) => number;
//# sourceMappingURL=math.d.ts.map