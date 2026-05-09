import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getEngine } from "../src/lib/engine";
import { resolveTimezoneFromLatLon, encryptString, isEncryptionEnabled, hashObject } from "@astro/utils";

const seed = async () => {
  const userId = process.env.DEV_USER_ID ?? "11111111-1111-1111-1111-111111111111";
  const email = process.env.DEV_USER_EMAIL ?? "demo@astro.dev";

  await prisma.user.upsert({
    where: { id: userId },
    update: { email },
    create: { id: userId, email }
  });

  const engine = getEngine();
  const encryptionEnabled = isEncryptionEnabled();

  const charts = [
    {
      brandId: "oracleveil",
      label: "Mystic Chart",
      birthDate: "1993-10-31",
      birthTime: "23:11",
      timeUnknown: false,
      lat: 34.8697,
      lon: -111.7609,
      locationLabel: "Sedona, Arizona, USA"
    },
    {
      brandId: "saturnseer",
      label: "Demo Chart Two",
      birthDate: "1988-02-04",
      birthTime: undefined,
      timeUnknown: true,
      lat: 34.0522,
      lon: -118.2437,
      locationLabel: "Los Angeles, USA"
    }
  ];

  for (const chart of charts) {
    const timezone = resolveTimezoneFromLatLon(chart.lat, chart.lon);
    const chartJson = await engine.calculateChart({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      timeUnknown: chart.timeUnknown,
      latitude: chart.lat,
      longitude: chart.lon,
      timezone
    });

    const chartHash = hashObject(chartJson);

    await prisma.chartProfile.create({
      data: {
        userId,
        brandId: chart.brandId,
        label: chart.label,
        birthDate: chart.birthDate,
        birthTimeEnc: !chart.timeUnknown && chart.birthTime && encryptionEnabled
          ? encryptString(chart.birthTime)
          : null,
        timeUnknown: chart.timeUnknown,
        latEnc: encryptionEnabled ? encryptString(String(chart.lat)) : null,
        lonEnc: encryptionEnabled ? encryptString(String(chart.lon)) : null,
        timezone,
        locationLabel: chart.locationLabel,
        chartHash,
        chartJson,
        isPrimary: chart.brandId === "oracleveil"
      }
    });
  }

  console.log("Seed complete.");
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
