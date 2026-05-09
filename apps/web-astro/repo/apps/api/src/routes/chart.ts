import type { FastifyInstance } from "fastify";
import { ChartRequestInput } from "../lib/validators";
import { getEngine } from "../lib/engine";
import { resolveTimezoneFromLatLon } from "@astro/utils";

export const chartRoutes = async (app: FastifyInstance) => {
  app.post("/natal", async (request, reply) => {
    const parsed = ChartRequestInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { birthDate, birthTime, timeUnknown, lat, lon, timezone, houseSystem } = parsed.data;
    const tz = timezone ?? resolveTimezoneFromLatLon(lat, lon);

    const engine = getEngine();
    const chart = await engine.calculateChart({
      birthDate,
      birthTime,
      timeUnknown,
      latitude: lat,
      longitude: lon,
      timezone: tz
    }, { houseSystem });

    return { chart };
  });
};
