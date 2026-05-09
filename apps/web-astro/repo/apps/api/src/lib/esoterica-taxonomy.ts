export type LoreTag = {
  id: string;
  keywords: string[];
};

export type Season = "winter" | "spring" | "summer" | "autumn";

export const BRAND_TAGS: LoreTag[] = [
  {
    id: "oracleveil",
    keywords: [
      "ritual",
      "sigil",
      "alchemy",
      "hermetic",
      "kabbalah",
      "qabalah",
      "theurgy",
      "occult",
      "initiation",
      "mystic",
      "mystical",
      "esoteric",
      "gnostic",
      "astral",
      "veil",
      "liminal",
      "temple"
    ]
  },
  {
    id: "saturnseer",
    keywords: [
      "saturn",
      "capricorn",
      "structure",
      "discipline",
      "authority",
      "boundary",
      "limitation",
      "time",
      "stoic",
      "austerity",
      "responsibility",
      "mastery",
      "order"
    ]
  },
  {
    id: "saturnleo",
    keywords: [
      "leo",
      "sun",
      "sovereign",
      "crown",
      "royal",
      "stage",
      "visibility",
      "glory",
      "creative",
      "performance",
      "authority"
    ]
  },
  {
    id: "jupiterseek",
    keywords: [
      "jupiter",
      "sagittarius",
      "expansion",
      "fortune",
      "luck",
      "abundance",
      "growth",
      "pilgrimage",
      "teacher",
      "philosophy",
      "meaning"
    ]
  },
  {
    id: "maleficme",
    keywords: [
      "mars",
      "saturn",
      "pluto",
      "scorpio",
      "underworld",
      "shadow",
      "transformation",
      "power",
      "fear",
      "blood",
      "death",
      "alchemy"
    ]
  }
];

export const GENERAL_TAGS: LoreTag[] = [
  {
    id: "astrology",
    keywords: ["zodiac", "horoscope", "natal", "planet", "aspect", "house", "retrograde"]
  },
  {
    id: "tarot",
    keywords: ["tarot", "arcana", "major arcana", "minor arcana"]
  },
  {
    id: "alchemy",
    keywords: ["alchemy", "alchemical", "solve et coagula", "nigredo", "albedo", "rubedo"]
  },
  {
    id: "myth",
    keywords: ["myth", "goddess", "god", "hero", "underworld", "oracle"]
  }
];

export const SEASONAL_BRAND_PROMPTS: Record<string, Record<Season, string>> = {
  oracleveil: {
    winter: "Winter: enter the inner temple, decode dreams, and work with stillness.",
    spring: "Spring: open the gates of renewal, cleanse the altar, and invite new allies.",
    summer: "Summer: expand the ritual circle, speak desires aloud, and claim visibility.",
    autumn: "Autumn: harvest insight, cut cords, and refine boundaries."
  },
  saturnseer: {
    winter: "Winter: fortify foundations and prioritize long-term discipline.",
    spring: "Spring: set new structures and anchor habits that will last.",
    summer: "Summer: hold the line with steady routines and measured ambition.",
    autumn: "Autumn: review obligations and trim what drains momentum."
  },
  saturnleo: {
    winter: "Winter: craft in private, refine voice, and build the next crown.",
    spring: "Spring: rehearse in the light and make the work visible.",
    summer: "Summer: lead with warmth, radiance, and creative authority.",
    autumn: "Autumn: edit the stage, keep only what sustains your fire."
  },
  jupiterseek: {
    winter: "Winter: study the map, listen for wisdom, and prepare the quest.",
    spring: "Spring: say yes to openings and follow the most alive path.",
    summer: "Summer: expand with intention, travel, teach, and mentor.",
    autumn: "Autumn: gather the harvest and turn growth into meaning."
  },
  maleficme: {
    winter: "Winter: descend into shadow work with courage and honesty.",
    spring: "Spring: transmute patterns and reopen power channels.",
    summer: "Summer: act with precision, cut hesitation, and claim agency.",
    autumn: "Autumn: sever what decays and protect what is vital."
  }
};

const collectTags = (text: string, tags: LoreTag[]): string[] => {
  const lower = text.toLowerCase();
  return tags
    .filter((tag) => tag.keywords.some((keyword) => lower.includes(keyword)))
    .map((tag) => tag.id);
};

export const inferTags = (text: string): string[] => {
  return Array.from(new Set([...collectTags(text, BRAND_TAGS), ...collectTags(text, GENERAL_TAGS)]));
};

export const getSeasonalPrompt = (brandId: string, season: Season): string | undefined => {
  return SEASONAL_BRAND_PROMPTS[brandId]?.[season];
};
