import "fastify";
import type { BrandId } from "../lib/brand";

declare module "fastify" {
  interface FastifyRequest {
    brandId: BrandId;
  }
}
