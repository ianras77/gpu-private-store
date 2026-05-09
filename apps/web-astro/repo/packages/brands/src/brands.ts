export type BrandId =
  | "jupiterseek"
  | "saturnseer"
  | "saturnleo"
  | "maleficme"
  | "oracleveil";

export interface BrandTokens {
  background: string;
  text: string;
  accent: string;
  muted: string;
  border: string;
  fontFamily: string;
  fontDisplay: string;
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
  };
}

export interface FocusModule {
  id: string;
  title: string;
  description: string;
  promptKey: string;
}

export interface BrandConfig {
  id: BrandId;
  name: string;
  domain: string;
  toneKeywords: string[];
  tabooList: string[];
  tokens: BrandTokens;
  focusModules: FocusModule[];
  assets: {
    icon: string;
    splash: string;
    og: string;
  };
}

const baseSpacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "40px"
};

const baseRadius = {
  sm: "6px",
  md: "12px",
  lg: "20px"
};

export const BRANDS: Record<BrandId, BrandConfig> = {
  jupiterseek: {
    id: "jupiterseek",
    name: "Jupiterseek",
    domain: "jupiterseek.com",
    toneKeywords: ["optimistic", "incisive", "growth", "meaning"],
    tabooList: ["guru", "destiny", "fear"],
    tokens: {
      background: "#fcfbf7",
      text: "#141312",
      accent: "#d4a100",
      muted: "#6b665f",
      border: "#e4e0d8",
      fontFamily: "'Cormorant Garamond', serif",
      fontDisplay: "'Work Sans', sans-serif",
      spacing: baseSpacing,
      radius: baseRadius
    },
    focusModules: [
      {
        id: "luck-ledger",
        title: "Luck Ledger",
        description: "Opportunities by house with timing hints.",
        promptKey: "luck_ledger"
      },
      {
        id: "quest-prompts",
        title: "Quest Prompts",
        description: "Concrete expansion actions.",
        promptKey: "quest_prompts"
      }
    ],
    assets: {
      icon: "packages/brands/assets/jupiterseek/icon.png",
      splash: "packages/brands/assets/jupiterseek/splash.png",
      og: "packages/brands/assets/jupiterseek/og.png"
    }
  },
  saturnseer: {
    id: "saturnseer",
    name: "Saturnseer",
    domain: "saturnseer.com",
    toneKeywords: ["disciplined", "direct", "steady", "earned"],
    tabooList: ["shame", "punishment", "doom"],
    tokens: {
      background: "#f7f7f4",
      text: "#101112",
      accent: "#3b4a5a",
      muted: "#6a6f75",
      border: "#d9dce0",
      fontFamily: "'Spectral', serif",
      fontDisplay: "'IBM Plex Sans', sans-serif",
      spacing: baseSpacing,
      radius: baseRadius
    },
    focusModules: [
      {
        id: "reality-check",
        title: "Reality Check",
        description: "Where to commit and what to trim.",
        promptKey: "reality_check"
      },
      {
        id: "structure-plans",
        title: "Structure Plans",
        description: "Discipline and boundary routines.",
        promptKey: "structure_plans"
      }
    ],
    assets: {
      icon: "packages/brands/assets/saturnseer/icon.png",
      splash: "packages/brands/assets/saturnseer/splash.png",
      og: "packages/brands/assets/saturnseer/og.png"
    }
  },
  saturnleo: {
    id: "saturnleo",
    name: "Saturn Leo",
    domain: "saturnleo.com",
    toneKeywords: ["regal", "minimal", "warm", "authoritative"],
    tabooList: ["ego", "grandiose", "humiliation"],
    tokens: {
      background: "#faf8f5",
      text: "#141211",
      accent: "#b25d2e",
      muted: "#6d625c",
      border: "#e3ddd7",
      fontFamily: "'Playfair Display', serif",
      fontDisplay: "'Inter Tight', sans-serif",
      spacing: baseSpacing,
      radius: baseRadius
    },
    focusModules: [
      {
        id: "crown-anvil",
        title: "Crown & Anvil",
        description: "Creative discipline and craft.",
        promptKey: "crown_anvil"
      },
      {
        id: "stagecraft",
        title: "Stagecraft",
        description: "Public self and visibility with integrity.",
        promptKey: "stagecraft"
      }
    ],
    assets: {
      icon: "packages/brands/assets/saturnleo/icon.png",
      splash: "packages/brands/assets/saturnleo/splash.png",
      og: "packages/brands/assets/saturnleo/og.png"
    }
  },
  maleficme: {
    id: "maleficme",
    name: "Malefic Me",
    domain: "maleficme.com",
    toneKeywords: ["candid", "edgy", "transformative", "direct"],
    tabooList: ["cruel", "insult", "fear"],
    tokens: {
      background: "#0c0b0a",
      text: "#f4f0ea",
      accent: "#d14f4f",
      muted: "#9b8f86",
      border: "#2a2421",
      fontFamily: "'Space Grotesk', sans-serif",
      fontDisplay: "'Space Grotesk', sans-serif",
      spacing: baseSpacing,
      radius: baseRadius
    },
    focusModules: [
      {
        id: "hard-truths",
        title: "Hard Truths",
        description: "Challenge patterns with clarity.",
        promptKey: "hard_truths"
      },
      {
        id: "transmute",
        title: "Transmute",
        description: "Transformation practices and rituals.",
        promptKey: "transmute"
      }
    ],
    assets: {
      icon: "packages/brands/assets/maleficme/icon.png",
      splash: "packages/brands/assets/maleficme/splash.png",
      og: "packages/brands/assets/maleficme/og.png"
    }
  },
  oracleveil: {
    id: "oracleveil",
    name: "Oracle Veil",
    domain: "oracleveil.com",
    toneKeywords: ["mystical", "intimate", "oracular", "ritual"],
    tabooList: ["guru", "fate", "doom", "curse", "guaranteed", "inevitable"],
    tokens: {
      background: "#f7f2ea",
      text: "#1b1612",
      accent: "#2b6f6a",
      muted: "#6a605b",
      border: "#e2d8cc",
      fontFamily: "'Cormorant Garamond', serif",
      fontDisplay: "'Work Sans', sans-serif",
      spacing: baseSpacing,
      radius: baseRadius
    },
    focusModules: [
      {
        id: "veilwalk",
        title: "Veilwalk",
        description: "Thresholds of intuition, dreams, and liminal choices.",
        promptKey: "veilwalk"
      },
      {
        id: "sigilcraft",
        title: "Sigilcraft",
        description: "Rituals for transmuting patterns into power.",
        promptKey: "sigilcraft"
      }
    ],
    assets: {
      icon: "packages/brands/assets/oracleveil/icon.png",
      splash: "packages/brands/assets/oracleveil/splash.png",
      og: "packages/brands/assets/oracleveil/og.png"
    }
  }
};

export const getBrand = (id: BrandId): BrandConfig => {
  return BRANDS[id];
};
