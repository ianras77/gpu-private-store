export interface Cache {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
}
export declare const createCache: () => Cache;
//# sourceMappingURL=cache.d.ts.map