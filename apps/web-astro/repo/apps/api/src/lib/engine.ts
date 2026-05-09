import type { AstroEngine } from "@astro/astro-core";
import { createAstronomyEngine } from "@astro/astro-engine-astro";
import { createSwissEngine } from "@astro/astro-engine-swiss";

export const getEngine = (): AstroEngine => {
  if (process.env.ASTRO_ENGINE === "swiss") {
    return createSwissEngine();
  }
  return createAstronomyEngine();
};
