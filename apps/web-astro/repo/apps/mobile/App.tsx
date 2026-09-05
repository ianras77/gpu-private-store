import React, { useEffect, useState, useRef } from "react";
import { ScrollView, View, Share, TouchableOpacity, Animated, Easing, Dimensions, StyleSheet, Text as RNText } from "react-native";
import Constants from "expo-constants";
import { BRANDS, BRAND_COPY } from "@astro/brands";
import { BrandThemeProvider, PageShell, Section, Heading, Text, Input, Button, Card, ChartWheel } from "../../packages/ui/src/index.native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, Line, Text as SvgText, Defs, RadialGradient, Stop } from "react-native-svg";

const extras = Constants.expoConfig?.extra as { brandId?: keyof typeof BRANDS; apiBase?: string } | undefined;
const brandId = extras?.brandId ?? "jupiterseek";

const resolveApiBase = () => {
  if (extras?.apiBase) return extras.apiBase;
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.hostUri;
  if (hostUri && typeof hostUri === "string") {
    const host = hostUri.split(":")[0];
    if (host) return `http://${host}:4020`;
  }
  return "http://localhost:4020";
};

const apiBase = resolveApiBase();
const brand = BRANDS[brandId];
const brandCopy = BRAND_COPY[brandId];

type Screen = "landing" | "intake" | "chart" | "reading" | "account";

type GeoCandidate = {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  timezone: string;
};

const PLANET_ORDER = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
];

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
] as const;

const ELEMENT_BY_SIGN: Record<string, string> = {
  Aries: "Fire",
  Leo: "Fire",
  Sagittarius: "Fire",
  Taurus: "Earth",
  Virgo: "Earth",
  Capricorn: "Earth",
  Gemini: "Air",
  Libra: "Air",
  Aquarius: "Air",
  Cancer: "Water",
  Scorpio: "Water",
  Pisces: "Water"
};

const MODALITY_BY_SIGN: Record<string, string> = {
  Aries: "Cardinal",
  Cancer: "Cardinal",
  Libra: "Cardinal",
  Capricorn: "Cardinal",
  Taurus: "Fixed",
  Leo: "Fixed",
  Scorpio: "Fixed",
  Aquarius: "Fixed",
  Gemini: "Mutable",
  Virgo: "Mutable",
  Sagittarius: "Mutable",
  Pisces: "Mutable"
};

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#ff7a4f",
  Earth: "#7bd18b",
  Air: "#7bb8ff",
  Water: "#8b6bff",
  Angle: "#f1d6ac"
};

const ASPECT_LABELS: Record<string, string> = {
  conjunction: "Conjunction",
  opposition: "Opposition",
  trine: "Trine",
  square: "Square",
  sextile: "Sextile"
};

const STEPS = [
  {
    title: "Anchor the Sky",
    text: "Enter birth date, time, and location to lock the horizon to you."
  },
  {
    title: "See the Pattern",
    text: "Watch the sky theater reveal signs, aspects, and planetary motion."
  },
  {
    title: "Receive the Reading",
    text: "Long-form narrative with rituals and concrete next steps."
  }
];

const CHART_KEYS = ["Sun", "Moon", "Rising", "Houses", "Aspects", "Retrogrades"];

const PLANET_THEMES: Record<string, string> = {
  Sun: "Core vitality and direction.",
  Moon: "Emotional rhythm and inner needs.",
  Mercury: "Mind, voice, and meaning-making.",
  Venus: "Attraction, pleasure, and values.",
  Mars: "Drive, will, and assertion.",
  Jupiter: "Expansion, faith, and growth.",
  Saturn: "Discipline, boundaries, and mastery.",
  Uranus: "Liberation, change, and awakening.",
  Neptune: "Dreams, intuition, and vision.",
  Pluto: "Transformation, power, and depth.",
  Asc: "First impression and approach to life.",
  MC: "Public path and ambition."
};

const ASPECT_MEANING: Record<string, string> = {
  conjunction: "Merged forces. The two planets speak as one.",
  opposition: "Polarity and tension. Integration is the lesson.",
  trine: "Natural flow. Gifts that want conscious direction.",
  square: "Friction and urgency. Growth through effort.",
  sextile: "Opportunity. Ease that responds to initiative."
};

const normalizeDegree = (deg: number): number => {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
};

const polarToCartesian = (center: number, radius: number, angle: number) => {
  const rad = ((normalizeDegree(angle) - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(rad),
    y: center + radius * Math.sin(rad)
  };
};

const countBy = (points: any[], lookup: Record<string, string>): Record<string, number> => {
  return points.reduce((acc, point) => {
    const label = lookup[point.sign];
    if (!label) return acc;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

const summarizeCounts = (order: string[], counts: Record<string, number>): string => {
  return order.map((label) => `${label} ${counts[label] ?? 0}`).join(" · ");
};

const dominantLabels = (order: string[], counts: Record<string, number>): string[] => {
  const max = Math.max(...order.map((label) => counts[label] ?? 0));
  if (!Number.isFinite(max) || max <= 0) return [];
  return order.filter((label) => (counts[label] ?? 0) === max);
};

const CHART_CURRENT_KEY = "astro_chart_current";
const CHART_LIBRARY_KEY = "astro_chart_library";

const generateId = () => `chart_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

const readJson = async (key: string) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = async (key: string, value: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
};

const withMeta = (chart: any) => {
  if (!chart || typeof chart !== "object") {
    return { id: generateId(), savedAt: new Date().toISOString() };
  }
  return {
    ...chart,
    id: chart.id ?? generateId(),
    savedAt: chart.savedAt ?? new Date().toISOString()
  };
};

const saveChart = async (chart: any) => {
  const next = withMeta(chart);
  const libraryRaw = await readJson(CHART_LIBRARY_KEY);
  const library = Array.isArray(libraryRaw) ? libraryRaw : [];
  const updated = [next, ...library.filter((item: any) => item?.id !== next.id)];
  await writeJson(CHART_LIBRARY_KEY, updated);
  await writeJson(CHART_CURRENT_KEY, next);
  return next;
};

const loadSavedChart = async () => {
  const current = await readJson(CHART_CURRENT_KEY);
  if (current) return current;
  const libraryRaw = await readJson(CHART_LIBRARY_KEY);
  const library = Array.isArray(libraryRaw) ? libraryRaw : [];
  return library[0] ?? null;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoCandidate[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeoCandidate | null>(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [chart, setChart] = useState<any | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [handbookPlan, setHandbookPlan] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState("Sun");
  const [story, setStory] = useState<{ type: "planet" | "aspect"; key: string } | null>(null);
  const orbitSpin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const boot = async () => {
      const saved = await loadSavedChart();
      if (saved && active) {
        setChart(saved);
      }
    };
    boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(orbitSpin, {
        toValue: 1,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    ).start();
  }, [orbitSpin, pulse]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationResults([]);
      setSearchingLocation(false);
      return;
    }
    if (selectedLocation && query === selectedLocation.name) {
      setLocationResults([]);
      setSearchingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const response = await fetch(`${apiBase}/v1/geo/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
          body: JSON.stringify({ query, limit: 6 }),
          signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error("Location lookup failed.");
        }
        setLocationResults(data.results ?? []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setLocationResults([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 320);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [locationQuery, selectedLocation]);

  const windowWidth = Dimensions.get("window").width;
  const orbitSize = Math.min(320, windowWidth - 72);
  const orbitCenter = orbitSize / 2;
  const ringRadius = orbitCenter - 12;
  const innerRadius = ringRadius - 26;

  const generateChart = async () => {
    setError(null);
    if (!birthDate) {
      setError("Add a birth date.");
      return;
    }
    if (!timeUnknown && !birthTime) {
      setError("Add a birth time or mark time unknown.");
      return;
    }
    if (!selectedLocation) {
      setError("Choose a location from the list.");
      return;
    }
    setLoading(true);
    const chartRes = await fetch(`${apiBase}/v1/chart/natal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
      body: JSON.stringify({
        birthDate,
        birthTime: timeUnknown || !birthTime ? undefined : birthTime,
        timeUnknown,
        lat: selectedLocation.lat,
        lon: selectedLocation.lon,
        timezone: selectedLocation.timezone
      })
    });
    const chartData = await chartRes.json();
    const stored = await saveChart({
      ...chartData.chart,
      birthDate,
      birthTime: timeUnknown || !birthTime ? undefined : birthTime,
      timeUnknown,
      locationLabel: selectedLocation.name,
      locationTimezone: selectedLocation.timezone
    });
    setChart(stored);
    setScreen("chart");
    setLoading(false);
  };

  const generateReading = async (length: "short" | "standard" | "deep") => {
    if (!chart) return;
    setLoading(true);
    const response = await fetch(`${apiBase}/v1/reading/natal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id },
      body: JSON.stringify({ chartJson: chart, brandId: brand.id, length })
    });
    const data = await response.json();
    setReading(data.reading);
    setScreen("reading");
    setLoading(false);
  };

  const planHandbook = async () => {
    if (!chart) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/v1/report-plans/life-handbook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Brand-Id": brand.id }, body: JSON.stringify({ chartJson: chart }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to plan handbook.");
      setHandbookPlan(data.plan);
      setScreen("reading");
    } catch (err: any) { setError(err.message ?? "Unable to plan handbook."); } finally { setLoading(false); }
  };

  const shareReading = async () => {
    if (!reading) return;
    const message = [
      brand.name,
      reading.overview?.[0] ?? "Natal chart reading",
      reading.actionables?.[0] ?? ""
    ]
      .filter(Boolean)
      .join("\n");
    await Share.share({ message });
  };

  const chartData = chart
    ? (() => {
        const findPoint = (key: string) => chart.points.find((point: any) => point.key === key);
        const planetPlacements = PLANET_ORDER.map((key) => findPoint(key)).filter(Boolean);
        const sun = findPoint("Sun");
        const moon = findPoint("Moon");
        const rising = findPoint("Asc");
        const anglePoints = ["Asc", "MC"].map((key) => findPoint(key)).filter(Boolean);
        const elementCounts = countBy(planetPlacements, ELEMENT_BY_SIGN);
        const modalityCounts = countBy(planetPlacements, MODALITY_BY_SIGN);
        const elementOrder = ["Fire", "Earth", "Air", "Water"];
        const modalityOrder = ["Cardinal", "Fixed", "Mutable"];
        const dominantElements = dominantLabels(elementOrder, elementCounts);
        const dominantModalities = dominantLabels(modalityOrder, modalityCounts);
        const aspectHighlights = [...(chart.aspects ?? [])]
          .sort((a: any, b: any) => a.orb - b.orb)
          .slice(0, 6);

        const orbitPoints = planetPlacements.map((point: any) => {
          const position = polarToCartesian(orbitCenter, ringRadius - 16, point.degree);
          return {
            ...point,
            ...position,
            element: ELEMENT_BY_SIGN[point.sign] ?? "Aether"
          };
        });

        const orbitAngles = anglePoints.map((point: any) => {
          const position = polarToCartesian(orbitCenter, ringRadius - 4, point.degree);
          return {
            ...point,
            ...position,
            element: "Angle"
          };
        });

        const orbitMap = new Map<string, { x: number; y: number }>();
        [...orbitPoints, ...orbitAngles].forEach((point: any) => {
          orbitMap.set(point.key, { x: point.x, y: point.y });
        });

        const signLabels = ZODIAC_SIGNS.map((sign, index) => {
          const position = polarToCartesian(orbitCenter, ringRadius + 8, index * 30);
          return { sign, ...position };
        });

        return {
          sun,
          moon,
          rising,
          planetPlacements,
          anglePoints,
          elementCounts,
          modalityCounts,
          elementOrder,
          modalityOrder,
          dominantElements,
          dominantModalities,
          aspectHighlights,
          orbitPoints,
          orbitAngles,
          orbitMap,
          signLabels
        };
      })()
    : null;

  const focusOptions = ["Sun", "Moon", "Rising", "Aspects", "Elements"];
  const focusDetail = chartData
    ? (() => {
        if (focusKey === "Sun") {
          return chartData.sun
            ? `Sun · ${chartData.sun.sign} ${chartData.sun.signDegree.toFixed(1)}°${chartData.sun.house ? ` · House ${chartData.sun.house}` : ""}`
            : "Sun placement missing from this chart.";
        }
        if (focusKey === "Moon") {
          return chartData.moon
            ? `Moon · ${chartData.moon.sign} ${chartData.moon.signDegree.toFixed(1)}°${chartData.moon.house ? ` · House ${chartData.moon.house}` : ""}`
            : "Moon placement missing from this chart.";
        }
        if (focusKey === "Rising") {
          return chartData.rising
            ? `Rising · ${chartData.rising.sign} ${chartData.rising.signDegree.toFixed(1)}°${chartData.rising.house ? ` · House ${chartData.rising.house}` : ""}`
            : "Birth time unknown: Rising sign and houses are hidden.";
        }
        if (focusKey === "Aspects") {
          const lead = chartData.aspectHighlights[0];
          return lead
            ? `${lead.between[0]} ${ASPECT_LABELS[lead.type] ?? lead.type} ${lead.between[1]} · orb ${lead.orb.toFixed(1)}°`
            : "No major aspects available for focus.";
        }
        const elementSummary = summarizeCounts(chartData.elementOrder, chartData.elementCounts);
        const modalitySummary = summarizeCounts(chartData.modalityOrder, chartData.modalityCounts);
        const elementNote = chartData.dominantElements.length ? `Dominant: ${chartData.dominantElements.join(", ")}.` : "";
        const modalityNote = chartData.dominantModalities.length ? `Dominant: ${chartData.dominantModalities.join(", ")}.` : "";
        return `Elements · ${elementSummary}. ${elementNote} Modality · ${modalitySummary}. ${modalityNote}`.trim();
      })()
    : "";

  const storyParagraphs = chartData
    ? (() => {
        if (!story) {
          return ["Tap a planet orb or aspect chip to open a focused story."];
        }
        if (story.type === "planet") {
          const point = chart.points.find((p: any) => p.key === story.key);
          if (!point) return ["That planet is missing from this chart."];
          const element = ELEMENT_BY_SIGN[point.sign] ?? "Aether";
          const modality = MODALITY_BY_SIGN[point.sign] ?? "Mutable";
          const houseText = point.house ? `House ${point.house}` : "No house data";
          const retrograde = point.retrograde ? "Retrograde pulls the story inward, asking for revision and reflection." : "";
          const theme = PLANET_THEMES[point.key] ?? "A key planetary signature.";
          const aspectsForPlanet = chart.aspects
            .filter((aspect: any) => aspect.between.includes(point.key))
            .sort((a: any, b: any) => a.orb - b.orb)
            .slice(0, 2);
          const aspectSummary = aspectsForPlanet.length
            ? `Key aspects: ${aspectsForPlanet
                .map((aspect: any) => `${aspect.between[0]} ${ASPECT_LABELS[aspect.type] ?? aspect.type} ${aspect.between[1]} (${aspect.orb.toFixed(1)}°)`)
                .join("; ")}.`
            : "No major aspects highlighted for this planet.";
          const aspectMeaning = aspectsForPlanet.length
            ? ASPECT_MEANING[aspectsForPlanet[0].type] ?? "These links shape how the planet expresses."
            : "";
          return [
            `${point.key} in ${point.sign} ${point.signDegree.toFixed(1)}° · ${houseText}. ${theme}`,
            `Element ${element} and ${modality} modality. ${aspectSummary}`,
            `${aspectMeaning} ${retrograde}`.trim()
          ];
        }
        const aspect = chartData.aspectHighlights.find(
          (a: any) => `${a.between.join("-")}-${a.type}` === story.key
        );
        if (!aspect) return ["That aspect is not in the highlighted set."];
        const label = `${aspect.between[0]} ${ASPECT_LABELS[aspect.type] ?? aspect.type} ${aspect.between[1]}`;
        const meaning = ASPECT_MEANING[aspect.type] ?? "A meaningful energetic link.";
        const aPoint = chart.points.find((p: any) => p.key === aspect.between[0]);
        const bPoint = chart.points.find((p: any) => p.key === aspect.between[1]);
        const aPlacement = aPoint
          ? `${aspect.between[0]} in ${aPoint.sign} ${aPoint.signDegree.toFixed(1)}°${aPoint.house ? ` · House ${aPoint.house}` : ""}`
          : aspect.between[0];
        const bPlacement = bPoint
          ? `${aspect.between[1]} in ${bPoint.sign} ${bPoint.signDegree.toFixed(1)}°${bPoint.house ? ` · House ${bPoint.house}` : ""}`
          : aspect.between[1];
        return [
          `${label} · orb ${aspect.orb.toFixed(1)}°. ${meaning}`,
          `${aPlacement} meets ${bPlacement}. ${PLANET_THEMES[aspect.between[0]] ?? "A core theme"} and ${PLANET_THEMES[aspect.between[1]] ?? "another core theme"} are in dialogue.`,
          "Integration prompt: name a choice that honors both sides without letting one erase the other."
        ];
      })()
    : [];

  const spin = orbitSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22]
  });

  return (
    <BrandThemeProvider brand={brand}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <PageShell>
          {screen === "landing" && (
            <>
              <Section>
                <View style={styles.hero}>
                  <View style={styles.heroCopy}>
                    <RNText style={[styles.kicker, { color: brand.tokens.muted }]}>{brandCopy.hero.kicker}</RNText>
                    <Heading>{brand.name}</Heading>
                    <Text muted>{brandCopy.hero.subtitle}</Text>
                    <RNText style={[styles.mantra, { color: brand.tokens.muted }]}>{brandCopy.hero.mantra}</RNText>
                    <View style={styles.heroActions}>
                      <Button onPress={() => setScreen("intake")}>Begin Reading</Button>
                      {chart ? (
                        <Button variant="ghost" onPress={() => setScreen("chart")}>
                          View Your Chart
                        </Button>
                      ) : null}
                    </View>
                    <View style={styles.pillRow}>
                      {CHART_KEYS.map((item) => (
                        <View
                          key={item}
                          style={[
                            styles.pill,
                            { borderColor: brand.tokens.border, backgroundColor: "rgba(255,255,255,0.08)" }
                          ]}
                        >
                          <RNText style={[styles.pillText, { color: brand.tokens.muted }]}>{item}</RNText>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.heroVisual}>
                    <View style={styles.heroOrbit}>
                      <View style={[styles.heroNode, styles.nodeOne, { backgroundColor: brand.tokens.accent, shadowColor: brand.tokens.accent }]} />
                      <View style={[styles.heroNode, styles.nodeTwo, { backgroundColor: brand.tokens.accent, shadowColor: brand.tokens.accent }]} />
                      <View style={[styles.heroNode, styles.nodeThree, { backgroundColor: brand.tokens.accent, shadowColor: brand.tokens.accent }]} />
                      <View style={[styles.heroNode, styles.nodeFour, { backgroundColor: brand.tokens.accent, shadowColor: brand.tokens.accent }]} />
                      <View style={styles.heroCenter}>
                        <RNText style={styles.heroCenterText}>Birth Chart</RNText>
                      </View>
                    </View>
                    <Card>
                      <View style={{ gap: 6 }}>
                        <RNText style={[styles.kicker, { color: brand.tokens.muted }]}>Long-Form Lens</RNText>
                        <Heading level={3}>A chart you can feel.</Heading>
                        <Text muted>We turn placements and aspects into a clear, grounded story.</Text>
                        {brandCopy.deliverables.slice(0, 3).map((item) => (
                          <Text key={item} muted>{item}</Text>
                        ))}
                      </View>
                    </Card>
                  </View>
                </View>
              </Section>
              <Section title="How It Works">
                <View style={styles.stepper}>
                  {STEPS.map((step, index) => (
                    <Card key={step.title}>
                      <View style={{ gap: 6 }}>
                        <RNText style={[styles.stepNumber, { color: brand.tokens.muted }]}>Step {index + 1}</RNText>
                        <Heading level={3}>{step.title}</Heading>
                        <Text muted>{step.text}</Text>
                      </View>
                    </Card>
                  ))}
                </View>
              </Section>
            </>
          )}

          {screen === "intake" && (
            <Section title="Birth Details">
              <Text>Date</Text>
              <Input value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" />
              <Text>Time</Text>
              <Input
                value={birthTime}
                onChangeText={setBirthTime}
                placeholder="HH:mm"
                editable={!timeUnknown}
              />
              <Button onPress={() => {
                const next = !timeUnknown;
                setTimeUnknown(next);
                if (next) setBirthTime("");
              }} variant="ghost">
                {timeUnknown ? "Time Known" : "Time Unknown"}
              </Button>
              <Text>Location</Text>
              <Input
                value={locationQuery}
                onChangeText={(value: string) => {
                  setError(null);
                  setLocationQuery(value);
                  if (selectedLocation && value !== selectedLocation.name) {
                    setSelectedLocation(null);
                  }
                }}
                placeholder="City, Country"
              />
              {selectedLocation ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <Text muted>Selected</Text>
                  <Text>{selectedLocation.name}</Text>
                  <Text muted>{selectedLocation.timezone}</Text>
                </View>
              ) : null}
              {searchingLocation ? <Text muted>Searching locations...</Text> : null}
              {!selectedLocation && locationResults.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {locationResults.map((candidate) => {
                    const meta = [candidate.timezone, candidate.description].filter(Boolean).join(" · ");
                    return (
                      <TouchableOpacity
                        key={candidate.id}
                        onPress={() => {
                          setError(null);
                          setSelectedLocation(candidate);
                          setLocationQuery(candidate.name);
                          setLocationResults([]);
                        }}
                      >
                        <Card>
                          <Text>{candidate.name}</Text>
                          <Text muted>{meta}</Text>
                        </Card>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              {!selectedLocation && !searchingLocation && locationQuery.trim().length >= 2 && locationResults.length === 0 ? (
                <Text muted>No matches yet. Try a nearby city or add a country.</Text>
              ) : null}
              {error ? <Text muted>{error}</Text> : null}
              <Button onPress={generateChart} disabled={loading}>
                {loading ? "Generating..." : "Generate Chart"}
              </Button>
            </Section>
          )}

          {screen === "chart" && chart && chartData && (
            <>
              <Section title="Sky Theater">
                {chart.locationLabel ? (
                  <Text muted>
                    {chart.locationLabel}
                    {chart.meta?.timezone ? ` · ${chart.meta.timezone}` : ""}
                  </Text>
                ) : null}
                <Text muted>
                  The sky is frozen to the instant you arrived. Each orb is a planet at its birth position,
                  the ring is the zodiac, and the lines are the strongest conversations between worlds.
                </Text>
                <View style={[styles.orbitContainer, { width: orbitSize, height: orbitSize }]}>
                  <Svg width={orbitSize} height={orbitSize} style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <RadialGradient id="skyGrad" cx="50%" cy="35%" r="65%">
                        <Stop offset="0%" stopColor="#1d2a33" stopOpacity="0.9" />
                        <Stop offset="70%" stopColor="#0c0f14" stopOpacity="1" />
                        <Stop offset="100%" stopColor="#0a0b10" stopOpacity="1" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx={orbitCenter} cy={orbitCenter} r={orbitCenter} fill="url(#skyGrad)" />
                    <Circle
                      cx={orbitCenter}
                      cy={orbitCenter}
                      r={ringRadius}
                      stroke="rgba(241, 214, 172, 0.28)"
                      strokeWidth={1}
                      fill="none"
                    />
                    <Circle
                      cx={orbitCenter}
                      cy={orbitCenter}
                      r={innerRadius}
                      stroke="rgba(241, 214, 172, 0.18)"
                      strokeWidth={1}
                      fill="none"
                    />
                    {chartData.aspectHighlights.map((aspect: any, index: number) => {
                      const a = chartData.orbitMap.get(aspect.between[0]);
                      const b = chartData.orbitMap.get(aspect.between[1]);
                      if (!a || !b) return null;
                      const baseOpacity = focusKey === "Aspects" ? 0.9 : 0.45;
                      const color = aspect.type === "opposition"
                        ? "rgba(222, 110, 92, 0.8)"
                        : aspect.type === "trine"
                        ? "rgba(102, 186, 190, 0.8)"
                        : aspect.type === "square"
                        ? "rgba(214, 140, 92, 0.8)"
                        : aspect.type === "sextile"
                        ? "rgba(130, 190, 150, 0.8)"
                        : "rgba(241, 214, 172, 0.8)";
                      return (
                        <Line
                          key={`${aspect.between.join("-")}-${index}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={color}
                          strokeOpacity={baseOpacity}
                          strokeWidth={1}
                        />
                      );
                    })}
                    {chartData.signLabels.map((item: any) => (
                      <SvgText
                        key={item.sign}
                        x={item.x}
                        y={item.y}
                        fontSize="8"
                        fill="rgba(241, 214, 172, 0.7)"
                        textAnchor="middle"
                      >
                        {item.sign}
                      </SvgText>
                    ))}
                  </Svg>

                  <Animated.View
                    style={[
                      styles.orbitSpin,
                      {
                        width: orbitSize * 0.76,
                        height: orbitSize * 0.76,
                        borderRadius: orbitSize,
                        transform: [{ rotate: spin }]
                      }
                    ]}
                  />

                  {chartData.orbitPoints.map((point: any) => {
                    const isFocused =
                      focusKey === "Sun"
                        ? point.key === "Sun"
                        : focusKey === "Moon"
                        ? point.key === "Moon"
                        : focusKey === "Rising"
                        ? point.key === "Asc"
                        : focusKey === "Aspects"
                        ? false
                        : true;
                    const faded =
                      focusKey === "Sun" || focusKey === "Moon" || focusKey === "Rising"
                        ? !isFocused
                        : focusKey === "Aspects"
                        ? true
                        : false;
                    const color = ELEMENT_COLORS[point.element] ?? "#f1d6ac";
                    return (
                      <TouchableOpacity
                        key={point.key}
                        onPress={() => setStory({ type: "planet", key: point.key })}
                        style={[
                          styles.orbitTouch,
                          {
                            left: point.x - 14,
                            top: point.y - 14
                          }
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.orbitPlanet,
                            {
                              backgroundColor: color,
                              shadowColor: color,
                              opacity: faded ? 0.28 : 1,
                              transform: [{ scale: pulseScale }]
                            }
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}

                  {chartData.orbitAngles.map((point: any) => (
                    <TouchableOpacity
                      key={point.key}
                      onPress={() => setStory({ type: "planet", key: point.key })}
                      style={[
                        styles.orbitTouch,
                        {
                          left: point.x - 14,
                          top: point.y - 14
                        }
                      ]}
                    >
                      <Animated.View
                        style={[
                          styles.orbitAngle,
                          {
                            transform: [{ scale: pulseScale }]
                          }
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.focusRow}>
                  {focusOptions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      onPress={() => setFocusKey(option)}
                      style={[
                        styles.focusButton,
                        { borderColor: brand.tokens.border },
                        focusKey === option ? { borderColor: brand.tokens.accent, backgroundColor: "rgba(255,255,255,0.08)" } : null
                      ]}
                    >
                      <RNText
                        style={[
                          styles.focusButtonText,
                          { color: brand.tokens.text },
                          focusKey === option ? { color: brand.tokens.accent } : null
                        ]}
                      >
                        {option}
                      </RNText>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.focusRow}>
                  {chartData.aspectHighlights.map((aspect: any, index: number) => {
                    const key = `${aspect.between.join("-")}-${aspect.type}`;
                    const label = `${aspect.between[0]} ${ASPECT_LABELS[aspect.type] ?? aspect.type} ${aspect.between[1]}`;
                    const active = story?.type === "aspect" && story.key === key;
                    return (
                      <TouchableOpacity
                        key={`${key}-${index}`}
                        onPress={() => setStory({ type: "aspect", key })}
                        style={[
                          styles.focusButton,
                          { borderColor: brand.tokens.border },
                          active ? { borderColor: brand.tokens.accent, backgroundColor: "rgba(255,255,255,0.08)" } : null
                        ]}
                      >
                        <RNText
                          style={[
                            styles.focusButtonText,
                            { color: brand.tokens.text },
                            active ? { color: brand.tokens.accent } : null
                          ]}
                        >
                          {label}
                        </RNText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Card>
                  <Heading level={3}>Focus</Heading>
                  <Text muted>{focusDetail}</Text>
                </Card>
                <Card>
                  <Heading level={3}>Story Thread</Heading>
                  {storyParagraphs.map((line, index) => (
                    <Text key={index} muted>{line}</Text>
                  ))}
                </Card>
              </Section>

              <Section title="Chart Reveal">
                <ChartWheel chart={chart} />
                <View style={{ gap: 8 }}>
                  {chart.points.slice(0, 6).map((point: any) => (
                    <Card key={point.key}>
                      <Heading level={3}>{point.key}</Heading>
                      <Text muted>
                        {point.sign} {point.signDegree.toFixed(1)}°{point.house ? ` · House ${point.house}` : ""}
                      </Text>
                    </Card>
                  ))}
                </View>
                <Button onPress={() => generateReading("deep")} disabled={loading}>
                  View Long Form
                </Button>
                <Button variant="ghost" onPress={planHandbook} disabled={loading}>
                  Plan Life Handbook
                </Button>
              </Section>
            </>
          )}

          {screen === "reading" && reading && (
            <Section title="Full Reading">
              {chart?.locationLabel ? (
                <Text muted>
                  {chart.locationLabel}
                  {chart.meta?.timezone ? ` · ${chart.meta.timezone}` : ""}
                </Text>
              ) : null}
              {reading.narrative?.length ? (
                <>
                  <Heading level={2}>Narrative</Heading>
                  {reading.narrative.map((paragraph: string, idx: number) => (
                    <Text key={idx}>{paragraph}</Text>
                  ))}
                </>
              ) : null}
              {reading.characterSheet ? (
                <>
                  <Heading level={2}>Character Sheet</Heading>
                  <Card>
                    <View style={{ gap: 8 }}>
                      <Heading level={3}>{reading.characterSheet.title}</Heading>
                      <Text muted>Archetypes</Text>
                      {reading.characterSheet.archetypes.map((item: string) => (
                        <Text key={item} muted>{item}</Text>
                      ))}
                      <Text muted>Strengths</Text>
                      {reading.characterSheet.strengths.map((item: string) => (
                        <Text key={item} muted>{item}</Text>
                      ))}
                      <Text muted>Shadows</Text>
                      {reading.characterSheet.shadows.map((item: string) => (
                        <Text key={item} muted>{item}</Text>
                      ))}
                      <Text muted>Path</Text>
                      {reading.characterSheet.path.map((item: string) => (
                        <Text key={item} muted>{item}</Text>
                      ))}
                      <Text muted>{reading.characterSheet.motto}</Text>
                    </View>
                  </Card>
                </>
              ) : null}
              <Heading level={2}>Overview</Heading>
              {reading.overview.map((line: string, idx: number) => (
                <Text key={idx}>{line}</Text>
              ))}
              <Heading level={2}>Big Three</Heading>
              <Text muted>{reading.bigThree.sun}</Text>
              <Text muted>{reading.bigThree.moon}</Text>
              {reading.bigThree.rising ? (
                <Text muted>{reading.bigThree.rising}</Text>
              ) : reading.bigThree.presentation ? (
                <Text muted>{reading.bigThree.presentation}</Text>
              ) : null}
              <Heading level={2}>Planets</Heading>
              <View style={{ gap: 8 }}>
                {reading.planets.map((item: any) => (
                  <Card key={item.planet}>
                    <Heading level={3}>{item.planet}</Heading>
                    <Text muted>{item.text}</Text>
                  </Card>
                ))}
              </View>
              {reading.houses?.length ? (
                <>
                  <Heading level={2}>Houses</Heading>
                  <View style={{ gap: 8 }}>
                    {reading.houses.map((item: any) => (
                      <Card key={item.house}>
                        <Heading level={3}>House {item.house}</Heading>
                        <Text muted>{item.text}</Text>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}
              <Heading level={2}>Aspects</Heading>
              <View style={{ gap: 8 }}>
                {reading.aspects.map((item: any) => (
                  <Card key={item.aspect}>
                    <Heading level={3}>{item.aspect}</Heading>
                    <Text muted>{item.text}</Text>
                  </Card>
                ))}
              </View>
              <Heading level={2}>Brand Lens</Heading>
              {reading.brandLens.map((item: any) => (
                <Card key={item.title}>
                  <Heading level={3}>{item.title}</Heading>
                  <Text muted>{item.text}</Text>
                </Card>
              ))}
              {reading.ritualCalendar?.length ? (
                <>
                  <Heading level={2}>Ritual Calendar</Heading>
                  {reading.ritualCalendar.map((item: any) => (
                    <Card key={`${item.date}-${item.title}`}>
                      <View style={{ gap: 4 }}>
                        <Heading level={3}>{item.title}</Heading>
                        <Text muted>{item.date}</Text>
                        <Text muted>{item.focus}</Text>
                        {item.transit ? <Text muted>{item.transit}</Text> : null}
                        <Text muted>{item.ritual}</Text>
                      </View>
                    </Card>
                  ))}
                </>
              ) : null}
              <Heading level={2}>Rituals</Heading>
              {reading.actionables.map((line: string, idx: number) => (
                <Text key={idx}>{line}</Text>
              ))}
              <Text muted>{reading.disclaimer}</Text>
              <Button onPress={shareReading}>Share</Button>
            </Section>
          )}

          {screen === "reading" && handbookPlan && !reading && (
            <Section title="Life Handbook Plan">
              <Text muted>A handbook is assembled from deterministic chart facts and only approved context or supplied frameworks.</Text>
              {handbookPlan.sections?.map((section: any) => (
                <Card key={section.key}>
                  <Heading level={3}>{section.title}</Heading>
                  <Text muted>{section.group} · {section.requiredFactCategories?.join(", ") || "narrative synthesis"}</Text>
                </Card>
              ))}
              {handbookPlan.omissions?.length ? <Text muted>Held back until qualified sources are supplied: {handbookPlan.omissions.join("; ")}</Text> : null}
            </Section>
          )}

          {screen === "account" && (
            <Section title="Account">
              <Text muted>Sign in to save charts and manage data.</Text>
              <Button>Send Magic Link</Button>
            </Section>
          )}
        </PageShell>
      </ScrollView>
    </BrandThemeProvider>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 18
  },
  heroCopy: {
    gap: 10
  },
  heroActions: {
    gap: 8
  },
  heroVisual: {
    gap: 12,
    alignItems: "center"
  },
  heroOrbit: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#0b0c12",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  heroNode: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }
  },
  nodeOne: {
    top: 28,
    left: 140
  },
  nodeTwo: {
    top: 150,
    left: 36
  },
  nodeThree: {
    top: 160,
    left: 156
  },
  nodeFour: {
    top: 60,
    left: 60
  },
  heroCenter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: "rgba(241, 214, 172, 0.25)",
    backgroundColor: "rgba(241, 214, 172, 0.1)",
    alignItems: "center",
    justifyContent: "center"
  },
  heroCenterText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(241, 214, 172, 0.85)"
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  mantra: {
    fontSize: 12,
    letterSpacing: 0.5
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1
  },
  pillText: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  stepper: {
    gap: 10
  },
  stepNumber: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  orbitContainer: {
    alignSelf: "center",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 6
  },
  orbitSpin: {
    position: "absolute",
    top: "12%",
    left: "12%",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(241, 214, 172, 0.35)",
    opacity: 0.7
  },
  orbitPlanet: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }
  },
  orbitTouch: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  orbitAngle: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(241, 214, 172, 0.9)",
    backgroundColor: "rgba(241, 214, 172, 0.25)",
    shadowColor: "rgba(241, 214, 172, 0.9)",
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  focusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  focusButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1
  },
  focusButtonText: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  }
});
