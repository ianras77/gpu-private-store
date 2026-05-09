"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/lib/prisma");
const engine_1 = require("../src/lib/engine");
const utils_1 = require("@astro/utils");
const seed = async () => {
    const userId = process.env.DEV_USER_ID ?? "11111111-1111-1111-1111-111111111111";
    const email = process.env.DEV_USER_EMAIL ?? "demo@astro.dev";
    await prisma_1.prisma.user.upsert({
        where: { id: userId },
        update: { email },
        create: { id: userId, email }
    });
    const engine = (0, engine_1.getEngine)();
    const encryptionEnabled = (0, utils_1.isEncryptionEnabled)();
    const charts = [
        {
            label: "Mystic Chart",
            birthDate: "1993-10-31",
            birthTime: "23:11",
            timeUnknown: false,
            lat: 34.8697,
            lon: -111.7609,
            locationLabel: "Sedona, Arizona, USA"
        },
        {
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
        const timezone = (0, utils_1.resolveTimezoneFromLatLon)(chart.lat, chart.lon);
        const chartJson = await engine.calculateChart({
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            timeUnknown: chart.timeUnknown,
            latitude: chart.lat,
            longitude: chart.lon,
            timezone
        });
        const chartHash = (0, utils_1.hashObject)(chartJson);
        await prisma_1.prisma.chartProfile.create({
            data: {
                userId,
                label: chart.label,
                birthDate: chart.birthDate,
                birthTimeEnc: !chart.timeUnknown && chart.birthTime && encryptionEnabled
                    ? (0, utils_1.encryptString)(chart.birthTime)
                    : null,
                timeUnknown: chart.timeUnknown,
                latEnc: encryptionEnabled ? (0, utils_1.encryptString)(String(chart.lat)) : null,
                lonEnc: encryptionEnabled ? (0, utils_1.encryptString)(String(chart.lon)) : null,
                timezone,
                locationLabel: chart.locationLabel,
                chartHash,
                chartJson
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
    await prisma_1.prisma.$disconnect();
});
