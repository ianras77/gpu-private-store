import type { BrandId } from "./brands";

export interface BrandCopy {
  hero: {
    kicker: string;
    subtitle: string;
    mantra: string;
  };
  signature: {
    title: string;
    items: Array<{ title: string; description: string }>;
  };
  deliverables: string[];
  intake: {
    intro: string;
    notes: string[];
    timeUnknown: string;
  };
  chart: {
    intro: string;
  };
  reading: {
    intro: string;
    notes: string[];
  };
  compatibility: {
    intro: string;
    notes: string[];
  };
  account: {
    intro: string;
    note: string;
  };
}

export const ASTRO_METHOD = [
  {
    title: "Planets",
    description: "The actors and drives living in your chart."
  },
  {
    title: "Signs",
    description: "The style, element, and tone of expression."
  },
  {
    title: "Houses",
    description: "The life arenas where themes unfold."
  },
  {
    title: "Aspects",
    description: "The conversations between planets."
  }
];

export const BRAND_COPY: Record<BrandId, BrandCopy> = {
  jupiterseek: {
    hero: {
      kicker: "Jupiter-ruled birth-chart readings",
      subtitle:
        "We turn your chart into a bright, generous map of growth, meaning, timing, and the doors that actually want to open.",
      mantra: "Luck loves preparation. Growth loves devotion."
    },
    signature: {
      title: "Expansion Rituals",
      items: [
        {
          title: "Opportunity Map",
          description: "Where Jupiter opens doors and where Saturn asks for commitment."
        },
        {
          title: "Quest Prompts",
          description: "Concrete actions that stretch you without scattering you."
        },
        {
          title: "Abundance Alignment",
          description: "Element and modality balance to keep growth sustainable."
        }
      ]
    },
    deliverables: [
      "Big Three narrative with house focus when time is known.",
      "Planet placements with retrogrades and house cues.",
      "Major aspects: conjunctions, trines, squares, oppositions, sextiles.",
      "Element and modality balance for pacing and growth."
    ],
    intake: {
      intro: "Give us the moment and the place, and we turn the sky into a map of openings, appetite, and direction.",
      notes: [
        "Exact time reveals Ascendant, Midheaven, and house cusps.",
        "If time is unknown, we read planets in signs and aspects without houses.",
        "Location pins the sky to your meridian for accurate angles."
      ],
      timeUnknown: "No exact time? We can still map planetary signatures and aspects."
    },
    chart: {
      intro: "Your chart is a bright field map: where life expands, where it overreaches, and where meaning wants to grow."
    },
    reading: {
      intro: "Choose the depth that fits your season. The reading stays generous, specific, and grounded in what your chart can actually support.",
      notes: [
        "We start with Sun, Moon, and Rising to set the story.",
        "We trace Jupiter and Saturn themes across houses and aspects.",
        "We highlight the easiest openings and the most important boundaries."
      ]
    },
    compatibility: {
      intro: "Weave two charts into one generous field map: what grows easily, what asks for faith, and where the pair needs real stewardship.",
      notes: [
        "We compare Sun, Moon, and Rising to set the shared tone.",
        "We spotlight harmony, friction, and the rituals that build trust.",
        "We translate synastry aspects into growth-focused guidance."
      ]
    },
    account: {
      intro: "Keep a private atlas of your charts, your first report, and the weekly entries that follow the same path over time.",
      note: "Delete charts or your account anytime."
    }
  },
  saturnseer: {
    hero: {
      kicker: "Saturn-led natal readings",
      subtitle:
        "We turn your chart into a plan for structure, boundaries, clean decisions, and momentum you can actually keep.",
      mantra: "Iron spine. Soft heart. No doom."
    },
    signature: {
      title: "Structure Rituals",
      items: [
        {
          title: "Boundary Blueprint",
          description: "Where Saturn asks for limits and steady focus."
        },
        {
          title: "Long Game Timing",
          description: "Slow-build aspects that reward consistency."
        },
        {
          title: "Stewardship Review",
          description: "Element balance to manage energy and responsibility."
        }
      ]
    },
    deliverables: [
      "Big Three narrative with house focus when time is known.",
      "Planet placements with retrogrades and house cues.",
      "Major aspects: conjunctions, trines, squares, oppositions, sextiles.",
      "Element and modality balance for stamina and pacing."
    ],
    intake: {
      intro: "Give us the moment and the place, and we will draw the chart with enough clarity to separate pressure from purpose.",
      notes: [
        "Exact time reveals Ascendant, Midheaven, and house cusps.",
        "If time is unknown, we read planets in signs and aspects without houses.",
        "Location pins the sky to your meridian for accurate angles."
      ],
      timeUnknown: "No exact time? We can still map planetary signatures and aspects."
    },
    chart: {
      intro: "Your chart is a structural map of pressure, responsibility, restraint, and the exact places strength can be built."
    },
    reading: {
      intro: "Choose the depth that fits your bandwidth. We keep the tone steady, serious, and useful enough to act on the same day.",
      notes: [
        "We start with Sun, Moon, and Rising to define the baseline.",
        "We track Saturn, angular houses, and aspect patterns.",
        "We spotlight commitments that bring long-term strength."
      ]
    },
    compatibility: {
      intro: "Map the relationship as a shared structure: vows, friction, limits, and the long-game timing that keeps the bond honest.",
      notes: [
        "We compare the Big Three to define the baseline contract.",
        "We name synastry pressure points and where boundaries help.",
        "We offer rituals that stabilize the bond over time."
      ]
    },
    account: {
      intro: "Keep the chart, the first report, and the weekly guidance in one disciplined record of your long game.",
      note: "Delete charts or your account anytime."
    }
  },
  saturnleo: {
    hero: {
      kicker: "Regal natal readings",
      subtitle:
        "We turn your chart into a creative leadership blueprint that feels warm, polished, sovereign, and actually usable.",
      mantra: "Velvet authority. Honest shine."
    },
    signature: {
      title: "Crown Rituals",
      items: [
        {
          title: "Crown and Craft",
          description: "Sun and Saturn together for mastery without burnout."
        },
        {
          title: "Stagecraft Integrity",
          description: "Public image aligned with honest visibility."
        },
        {
          title: "Heartwork Rhythm",
          description: "Element balance to keep the flame steady."
        }
      ]
    },
    deliverables: [
      "Big Three narrative with house focus when time is known.",
      "Planet placements with retrogrades and house cues.",
      "Major aspects: conjunctions, trines, squares, oppositions, sextiles.",
      "Element and modality balance for creative pacing."
    ],
    intake: {
      intro: "Give us the moment and the place, and we will draw the chart that reveals both your inner fire and your public stage.",
      notes: [
        "Exact time reveals Ascendant, Midheaven, and house cusps.",
        "If time is unknown, we read planets in signs and aspects without houses.",
        "Location pins the sky to your meridian for accurate angles."
      ],
      timeUnknown: "No exact time? We can still map planetary signatures and aspects."
    },
    chart: {
      intro: "Your chart is a map of creative authority, heart, visibility, and the craft required to carry all three well."
    },
    reading: {
      intro: "Choose the depth that fits your season. We read for leadership, style, stamina, and the parts of the chart that deserve a spotlight.",
      notes: [
        "We start with Sun, Moon, and Rising to set the creative arc.",
        "We track Saturn, the Sun, and aspect patterns for mastery.",
        "We spotlight the houses that shape your public voice."
      ]
    },
    compatibility: {
      intro: "Map the relationship as a creative partnership: warmth, pride, shared visibility, and the craft needed to keep the flame elegant.",
      notes: [
        "We compare the Big Three to see how each of you shines.",
        "We highlight synastry that supports collaboration and pride.",
        "We offer rituals that keep the bond warm and steady."
      ]
    },
    account: {
      intro: "Keep the chart, the first reading, and the weekly notes that protect your creative flame and public voice.",
      note: "Delete charts or your account anytime."
    }
  },
  maleficme: {
    hero: {
      kicker: "Candid natal readings",
      subtitle:
        "We read your chart with precision and edge, naming the tension, the appetite, and the exact place transformation wants to begin.",
      mantra: "Say the hard thing. Keep the mercy."
    },
    signature: {
      title: "Alchemy Rituals",
      items: [
        {
          title: "Shadow Mirror",
          description: "Where Mars and Saturn test, and how to respond."
        },
        {
          title: "Edgework",
          description: "Aspects that demand courage, not fear."
        },
        {
          title: "Transmutation",
          description: "Element balance that turns pressure into power."
        }
      ]
    },
    deliverables: [
      "Big Three narrative with house focus when time is known.",
      "Planet placements with retrogrades and house cues.",
      "Major aspects: conjunctions, trines, squares, oppositions, sextiles.",
      "Element and modality balance for intensity and recovery."
    ],
    intake: {
      intro: "Give us the moment and the place, and we will draw the chart where the pressure points finally stop hiding.",
      notes: [
        "Exact time reveals Ascendant, Midheaven, and house cusps.",
        "If time is unknown, we read planets in signs and aspects without houses.",
        "Location pins the sky to your meridian for accurate angles."
      ],
      timeUnknown: "No exact time? We can still map planetary signatures and aspects."
    },
    chart: {
      intro: "Your chart is a map of pressure points, courage, appetite, shadow, and the places change is already pushing."
    },
    reading: {
      intro: "Choose the depth that fits your edge. We keep it sharp, factual, unsentimental, and brave enough to be useful.",
      notes: [
        "We start with Sun, Moon, and Rising to set the core story.",
        "We track Mars, Saturn, and aspect patterns for leverage points.",
        "We spotlight the houses where change is already in motion."
      ]
    },
    compatibility: {
      intro: "Read the bond with clarity: where it burns, where it heals, what it tempts, and what it will cost if left unconscious.",
      notes: [
        "We compare the Big Three to name the raw truth of the match.",
        "We highlight synastry tension that can become alchemy.",
        "We offer rituals that turn intensity into loyalty."
      ]
    },
    account: {
      intro: "Keep the chart, the first report, and the weekly notes that trace transformation as it actually happens.",
      note: "Delete charts or your account anytime."
    }
  },
  oracleveil: {
    hero: {
      kicker: "Oracular natal readings",
      subtitle:
        "We turn your chart into a moonlit ritual narrative of thresholds, intuition, power, and the call that keeps returning.",
      mantra: "Soft voice. True signal. No cheap mysticism."
    },
    signature: {
      title: "Veil Rituals",
      items: [
        {
          title: "Veilwalk",
          description: "Where intuition sharpens and the liminal opens."
        },
        {
          title: "Sigilcraft",
          description: "Practices to transmute patterns into power."
        },
        {
          title: "Temple Balance",
          description: "Element and modality balance to shape your pacing."
        }
      ]
    },
    deliverables: [
      "Long-form narrative grounded in the Big Three and chart ruler.",
      "Planet placements with retrogrades and house cues when time is known.",
      "Major aspects with mythic framing and practical integration.",
      "Element and modality balance for energy and tempo."
    ],
    intake: {
      intro: "Give us the moment and the place, and we will set the altar of the sky so the chart can speak with precision.",
      notes: [
        "Exact time reveals Ascendant, Midheaven, and house cusps.",
        "If time is unknown, we read planets in signs and aspects without houses.",
        "Location anchors the sky to your meridian for accurate angles."
      ],
      timeUnknown: "No exact time? We can still map planetary signatures and aspects."
    },
    chart: {
      intro: "Your chart is a ritual map: the sky stitched to your body, your place, and the threshold you entered through."
    },
    reading: {
      intro: "Choose the depth that fits your moment. We blend mythic language with precise chart facts, so the reading feels like a spell and still holds up in daylight.",
      notes: [
        "We open with Sun, Moon, and Rising to set the mythic arc.",
        "We track chart ruler, elements, and aspects for the deeper pattern.",
        "We end with rituals: grounded steps that embody the insight."
      ]
    },
    compatibility: {
      intro: "Read the bond as a shared ritual: threshold, vow, seduction, devotion, and the pattern the two of you keep waking inside.",
      notes: [
        "We compare the Big Three to see how the pair is initiated.",
        "We interpret synastry as the weave between your stories.",
        "We give rituals to keep the bond intentional and alive."
      ]
    },
    account: {
      intro: "Keep the chart, the first oracle, and the weekly entries that return to the same spellbook again and again.",
      note: "Delete charts or your account anytime."
    }
  }
};
