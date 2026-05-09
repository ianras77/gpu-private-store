export type VolatileCacheEntry<T> = {
  value: T;
  at: number;
};

export const createVolatileCache = <T>() => {
  let entry: VolatileCacheEntry<T> | null = null;

  return {
    read(maxAgeMs: number) {
      if (!entry) return null;
      return Date.now() - entry.at <= Math.max(0, maxAgeMs) ? entry : null;
    },
    write(value: T) {
      entry = {
        value,
        at: Date.now()
      };
      return entry;
    }
  };
};

