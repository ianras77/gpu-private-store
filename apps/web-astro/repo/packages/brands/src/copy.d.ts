import type { BrandId } from "./brands";
export interface BrandCopy {
    hero: {
        kicker: string;
        subtitle: string;
        mantra: string;
    };
    signature: {
        title: string;
        items: Array<{
            title: string;
            description: string;
        }>;
    };
    deliverables: string[];
    intake: {
        intro: string;
        notes: string[];
        timeUnknown: string;
    };
    chart: {
        intro: string;
    };
    reading: {
        intro: string;
        notes: string[];
    };
    account: {
        intro: string;
        note: string;
    };
}
export declare const ASTRO_METHOD: {
    title: string;
    description: string;
}[];
export declare const BRAND_COPY: Record<BrandId, BrandCopy>;
//# sourceMappingURL=copy.d.ts.map