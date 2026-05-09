export type BrandId = "jupiterseek" | "saturnseer" | "saturnleo" | "maleficme";
export interface BrandTokens {
    background: string;
    text: string;
    accent: string;
    muted: string;
    border: string;
    fontFamily: string;
    fontDisplay: string;
    spacing: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
    };
    radius: {
        sm: string;
        md: string;
        lg: string;
    };
}
export interface FocusModule {
    id: string;
    title: string;
    description: string;
    promptKey: string;
}
export interface BrandConfig {
    id: BrandId;
    name: string;
    domain: string;
    toneKeywords: string[];
    tabooList: string[];
    tokens: BrandTokens;
    focusModules: FocusModule[];
    assets: {
        icon: string;
        splash: string;
        og: string;
    };
}
export declare const BRANDS: Record<BrandId, BrandConfig>;
export declare const getBrand: (id: BrandId) => BrandConfig;
//# sourceMappingURL=brands.d.ts.map