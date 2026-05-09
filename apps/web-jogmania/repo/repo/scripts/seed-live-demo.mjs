#!/usr/bin/env node

const apiBaseUrl = (process.env.JOGMANIA_API_URL ?? "http://127.0.0.1:3178").replace(/\/$/, "");
const publicApiBaseUrl = (process.env.JOGMANIA_PUBLIC_API_URL ?? apiBaseUrl).replace(/\/$/, "");
const demoEmail = process.env.JOGMANIA_DEMO_EMAIL ?? "ian@jogmania.run";
const demoPassword = process.env.JOGMANIA_DEMO_PASSWORD ?? "Mycobacteri@98";

const PHONE_DEVICE_ID = "jm-seed-ian-iphone";
const WATCH_DEVICE_ID = "jm-seed-ian-watch";

const COURSE_LAYOUTS = {
  "Neon Canopy": {
    lat: 34.0522,
    lon: -118.2437,
    latRadius: 0.0042,
    lonRadius: 0.0032,
    driftLat: 0.0005,
    driftLon: -0.0004,
    altitudeBase: 44
  },
  "Temple Steps": {
    lat: 37.7749,
    lon: -122.4194,
    latRadius: 0.0034,
    lonRadius: 0.0025,
    driftLat: 0.0008,
    driftLon: 0.0003,
    altitudeBase: 62
  },
  "Riverlight Loop": {
    lat: 47.6062,
    lon: -122.3321,
    latRadius: 0.0029,
    lonRadius: 0.0039,
    driftLat: -0.0006,
    driftLon: 0.0005,
    altitudeBase: 18
  }
};

const workoutSpecs = [
  {
    key: "neon-iphone-1",
    courseName: "Neon Canopy",
    source: "ios",
    deviceId: PHONE_DEVICE_ID,
    startedAt: "2026-03-15T13:12:00Z",
    durationS: 1320,
    distanceM: 3280,
    caloriesKcal: 392,
    avgHr: 156,
    elevationGainM: 48,
    rawPayloadJson: {
      capture_mode: "seed-ios",
      synced_via: "iphone"
    }
  },
  {
    key: "neon-watch-2",
    courseName: "Neon Canopy",
    source: "watch",
    deviceId: WATCH_DEVICE_ID,
    startedAt: "2026-03-16T13:07:00Z",
    durationS: 1164,
    distanceM: 3360,
    caloriesKcal: 436,
    avgHr: 174,
    elevationGainM: 54,
    rawPayloadJson: {
      capture_mode: "seed-watch",
      synced_via: "watchos",
      companion_device_id: PHONE_DEVICE_ID
    }
  },
  {
    key: "temple-iphone-1",
    courseName: "Temple Steps",
    source: "ios",
    deviceId: PHONE_DEVICE_ID,
    startedAt: "2026-03-17T06:18:00Z",
    durationS: 1700,
    distanceM: 4180,
    caloriesKcal: 502,
    avgHr: 162,
    elevationGainM: 88,
    rawPayloadJson: {
      capture_mode: "seed-ios",
      synced_via: "iphone"
    }
  },
  {
    key: "temple-iphone-2",
    courseName: "Temple Steps",
    source: "ios",
    deviceId: PHONE_DEVICE_ID,
    startedAt: "2026-03-18T06:09:00Z",
    durationS: 1510,
    distanceM: 4180,
    caloriesKcal: 541,
    avgHr: 167,
    elevationGainM: 92,
    rawPayloadJson: {
      capture_mode: "seed-ios",
      synced_via: "iphone"
    }
  },
  {
    key: "river-watch-1",
    courseName: "Riverlight Loop",
    source: "watch",
    deviceId: WATCH_DEVICE_ID,
    startedAt: "2026-03-19T18:21:00Z",
    durationS: 956,
    distanceM: 2740,
    caloriesKcal: 348,
    avgHr: 171,
    elevationGainM: 22,
    rawPayloadJson: {
      capture_mode: "seed-watch",
      synced_via: "watchos",
      companion_device_id: PHONE_DEVICE_ID
    }
  },
  {
    key: "river-iphone-2",
    courseName: "Riverlight Loop",
    source: "ios",
    deviceId: PHONE_DEVICE_ID,
    startedAt: "2026-03-20T18:11:00Z",
    durationS: 872,
    distanceM: 2740,
    caloriesKcal: 331,
    avgHr: 164,
    elevationGainM: 24,
    rawPayloadJson: {
      capture_mode: "seed-ios",
      synced_via: "iphone"
    }
  }
];

function detailMessage(payload) {
  if (!payload) return "Unknown error";
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => item?.msg).filter(Boolean).join(", ") || JSON.stringify(payload.detail);
  }
  if (typeof payload.message === "string") return payload.message;
  return JSON.stringify(payload);
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {
    Accept: "application/json"
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await response.text();
  let payload = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : detailMessage(payload);
    const error = new Error(`${method} ${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function buildPoints(courseName, startedAt, durationS, pointCount = 42) {
  const layout = COURSE_LAYOUTS[courseName];
  if (!layout) {
    throw new Error(`Missing course layout for ${courseName}`);
  }

  const startedAtMs = Date.parse(startedAt);
  const intervalMs = Math.max(1000, Math.floor((durationS * 1000) / (pointCount - 1)));

  return Array.from({ length: pointCount }, (_, index) => {
    const phase = index / (pointCount - 1);
    const angle = phase * Math.PI * 2;
    const lat = layout.lat + Math.sin(angle) * layout.latRadius + phase * layout.driftLat;
    const lon = layout.lon + Math.cos(angle) * layout.lonRadius + phase * layout.driftLon;
    const altitude = layout.altitudeBase + Math.sin(angle * 2) * 7 + phase * 18;

    return {
      lat: round(lat),
      lon: round(lon),
      altitude_m: round(altitude),
      timestamp: new Date(startedAtMs + intervalMs * index).toISOString(),
      accuracy_m: 5
    };
  });
}

function workoutPayload(spec, routeId) {
  const endedAt = new Date(Date.parse(spec.startedAt) + spec.durationS * 1000).toISOString();
  return {
    source: spec.source,
    started_at: spec.startedAt,
    ended_at: endedAt,
    duration_s: spec.durationS,
    distance_m: spec.distanceM,
    avg_pace_s_per_km: round(spec.durationS / (spec.distanceM / 1000)),
    calories_kcal: spec.caloriesKcal,
    avg_hr: spec.avgHr,
    elevation_gain_m: spec.elevationGainM,
    route_id: routeId,
    device_id: spec.deviceId,
    raw_payload_json: {
      ...spec.rawPayloadJson,
      seed_key: spec.key,
      device_id: spec.deviceId,
      course_name: spec.courseName
    },
    gps_points: buildPoints(spec.courseName, spec.startedAt, spec.durationS)
  };
}

async function ensureAuth() {
  try {
    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: { email: demoEmail, password: demoPassword }
    });
    if (loginResponse?.access_token) {
      return loginResponse.access_token;
    }
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
  }

  try {
    const registerResponse = await request("/auth/register", {
      method: "POST",
      body: { email: demoEmail, password: demoPassword }
    });

    if (registerResponse?.requires_verification) {
      throw new Error(`Email verification is enabled for ${demoEmail}; seed script cannot proceed automatically.`);
    }

    if (registerResponse?.access_token) {
      return registerResponse.access_token;
    }
  } catch (error) {
    const message = detailMessage(error.payload);
    if (error.status !== 400 || !message.toLowerCase().includes("already registered")) {
      throw error;
    }
  }

  const retryLogin = await request("/auth/login", {
    method: "POST",
    body: { email: demoEmail, password: demoPassword }
  });

  if (!retryLogin?.access_token) {
    throw new Error(`Unable to obtain an access token for ${demoEmail}.`);
  }

  return retryLogin.access_token;
}

function mapCourses(routes) {
  const courseByName = new Map();
  routes
    .filter((route) => route.is_course)
    .forEach((route) => {
      courseByName.set(route.name, route);
    });
  return courseByName;
}

async function ensureExtraParty(token, parties, routeId) {
  const partyName = "Ian After Dark";
  let party = parties.find((entry) => entry.name === partyName);

  if (!party) {
    party = await request("/parties", {
      method: "POST",
      token,
      body: {
        name: partyName,
        world_name: "Midnight Relay",
        world_theme: "synth",
        members: [
          { name: "Vega", role: "Scout" },
          { name: "Rune", role: "Guardian" },
          { name: "Pixel", role: "Navigator" }
        ]
      }
    });
  }

  await request(`/parties/${party.id}/world/enter`, {
    method: "POST",
    token,
    body: { route_id: routeId }
  });

  return party;
}

async function main() {
  const token = await ensureAuth();

  const user = await request("/me", { token });
  console.log(`Using demo account: ${user.email}`);

  const registeredPhone = await request("/devices/register", {
    method: "POST",
    token,
    body: {
      platform: "ios",
      device_id: PHONE_DEVICE_ID,
      name: "Ian's iPhone",
      metadata_json: {
        app: "seed-live-demo",
        sync: "primary",
        owner: "ian"
      }
    }
  });

  const registeredWatch = await request("/devices/register", {
    method: "POST",
    token,
    body: {
      platform: "watch",
      device_id: WATCH_DEVICE_ID,
      name: "Ian's Apple Watch",
      companion_device_id: PHONE_DEVICE_ID,
      metadata_json: {
        app: "seed-live-demo",
        sync: "companion",
        owner: "ian",
        simulated: false
      }
    }
  });

  let routes = await request("/routes", { token });
  let parties = await request("/parties", { token });
  const courseByName = mapCourses(routes);
  const primaryParty = parties.find((party) => party.name === "Arcade Vanguard") ?? parties[0];

  if (!primaryParty) {
    throw new Error("Starter party was not created for the seeded account.");
  }

  for (const spec of workoutSpecs) {
    const route = courseByName.get(spec.courseName);
    if (!route) {
      throw new Error(`Missing course "${spec.courseName}" for ${demoEmail}.`);
    }

    await request(`/parties/${primaryParty.id}/world/enter`, {
      method: "POST",
      token,
      body: { route_id: route.id }
    });

    const created = await request("/workouts", {
      method: "POST",
      token,
      body: workoutPayload(spec, route.id)
    });

    console.log(
      `Seeded ${spec.source.padEnd(5)} run on ${spec.courseName} -> ${created.id}`
    );
  }

  routes = await request("/routes", { token });
  parties = await request("/parties", { token });
  const updatedCourseByName = mapCourses(routes);

  const templeRoute = updatedCourseByName.get("Temple Steps");
  if (!templeRoute) {
    throw new Error("Temple Steps route missing after seed.");
  }

  const extraParty = await ensureExtraParty(token, parties, templeRoute.id);
  const workouts = await request("/workouts", { token });
  const templeRun = workouts.find(
    (workout) =>
      typeof workout.started_at === "string" &&
      workout.started_at.startsWith("2026-03-18T06:09:00")
  )
    ?? workouts.find((workout) => workout.source === "ios");

  if (templeRun) {
    await request(`/parties/${extraParty.id}/world/play`, {
      method: "POST",
      token,
      body: { workout_id: templeRun.id }
    });
  }

  const [refreshedParties, rewards, inventory, devices, worldEvents, exportResult] = await Promise.all([
    request("/parties", { token }),
    request("/rewards", { token }),
    request("/inventory", { token }),
    request("/devices", { token }),
    request(`/parties/${primaryParty.id}/world/events`, { token }),
    workouts[0]
      ? request(`/exports/workout/${workouts[0].id}`, { method: "POST", token })
      : Promise.resolve(null)
  ]);

  console.log("");
  console.log("Live demo summary");
  console.log(`- Courses: ${routes.filter((route) => route.is_course).length}`);
  console.log(`- Workouts: ${workouts.length}`);
  console.log(`- Rewards: ${rewards.length}`);
  console.log(`- Inventory items: ${inventory.length}`);
  console.log(`- Devices: ${devices.length} (${registeredPhone.platform} + ${registeredWatch.platform})`);
  console.log(`- Parties: ${refreshedParties.length}`);
  console.log(`- Primary world events: ${worldEvents.length}`);
  if (exportResult?.url) {
    console.log(`- Export URL: ${exportResult.url}`);
  }
  console.log("");
  console.log(`Web: ${process.env.JOGMANIA_WEB_URL ?? "http://127.0.0.1:3177"}`);
  console.log(`API: ${publicApiBaseUrl}`);
  console.log(`Login email: ${demoEmail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
