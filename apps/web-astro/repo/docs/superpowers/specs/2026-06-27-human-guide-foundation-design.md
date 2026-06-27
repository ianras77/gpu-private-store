# Human Guide Foundation Design

Date: 2026-06-27
Scope: Phase 1 calculation truth, Phase 2 chart intelligence, Phase 3 Human Guide schema.

## Purpose

The astrology platform should become a thoughtful symbolic instrument for exploring the full human picture. It should not be a fortune-telling product, a doctrinal religious product, or a generic AI self-help report. The birth chart is the foundation for a personal guide: a rich, living map of body, psyche, time, vocation, love, shadow, inspiration, and practice.

The system should feel sane, beautiful, and serious. It should open the inner world without making the user feel that they have entered something strange or cultic. The guiding aesthetic is vibration over material mechanics: patterns, resonance, attention, imagination, and direct inspiration matter more than deterministic claims.

## Meta-World

The platform lives inside a non-doctrinal meta-world called the Living Cosmos.

The Living Cosmos treats astrology as one symbolic language among several ancient languages of self-knowledge. Hermeticism is the primary source grammar: the human being is a microcosm, the sky is a mirror of pattern, symbols bridge levels of reality, and inner/outer life can be contemplated together.

The platform uses traditions as witnesses, not masters. It may draw from Hermetic, contemplative, Christian wisdom-teacher, Buddhist, psychological astrology, Human Design, mythic, and perennial materials, but it must not require allegiance to any one doctrine.

Jesus is treated as a wisdom teacher and image of love, not as an institutional authority. The desired direction is closer to Seth/Jane Roberts in spirit than to ecclesiastical command: consciousness-first, inward participation, direct inspiration, and the person's role in shaping experienced reality. Seth/Jane Roberts is not currently present in the local corpus, so this remains a voice and philosophy preference until source texts are added.

The Human Guide should feel closer to an internal map than a report. It may borrow from Human Design's feeling of a body-chart and from Kabbalah's Tree-of-Life style of inner architecture, but it must not copy either system or claim to be either system. The borrowing is structural and allegorical: centers, paths, chambers, thresholds, and vertical ascent/descent. Hermeticism remains the source grammar that makes this coherent.

## Source Policy

The Human Guide must be grounded in the local source corpus under:

`/data/runtipi/media/data/web-astro`

Approved default source families:

- Hermetic and perennial: `The Way of Hermes`, `The Symbolism of the Cross`, Plotinus, Boehme, Gnostic and perennial texts.
- Astrology craft: Avelar/Ribeiro, Abu Ma'shar, Burk, Houlding, Sasportas, Greene, Arroyo, Marks, Nicholas, and related astrology texts.
- Contemplative practice: Buddhist practice texts, ACIM, selected Biblical wisdom and desert motifs.
- Structural inspiration: Human Design texts for chart-as-human-map inspiration, without copying its centers/gates/channels model.
- Structural inspiration not yet locally grounded: Kabbalah-like tree/path architecture may influence the internal map design, but direct Kabbalah claims require adding source texts to the corpus.
- Myth and tarot: allowed as allegorical support when retrieved by chart-specific relevance.

Excluded from default Human Guide voice:

- Necromantic, coercive, curse, ceremonial domination, fear-based, or hard occult materials.
- Any source framing that pushes one doctrine as the final authority.

All generated Human Guide outputs should carry source provenance: source titles, retrieval tags, and which schema sections they informed. The product should paraphrase and synthesize. It must not quote long passages or imply endorsement of a doctrine.

## Core Principles

1. Correspondence: the chart mirrors pattern; it does not imprison the person.
2. Participation: the user participates in meaning through attention, choice, practice, and love.
3. Remembrance: the guide helps the person remember what is true, alive, and whole.
4. Integration: shadow, desire, grief, anger, tenderness, vocation, and longing are all material for wisdom.
5. Direct inspiration: the guide should lead the user back to inner listening, prayer, contemplation, imagination, conscience, silence, and embodied discernment.
6. Ancient practicality: the guide should offer practices of attention, restraint, forgiveness, study, devotion, service, courage, patience, right speech, and right action.

## Phase 3: Human Guide Schema

Phase 3 defines the target output. Phases 1 and 2 serve this.

The Human Guide should be experienced as an inner body-map. Each chart factor should be placed into a symbolic architecture rather than flattened into paragraphs. The map should feel like the user can walk it: root, heart, mind, voice, crown; descent into shadow; ascent into inspiration; paths between desire and service, fear and trust, wound and vow. This is Human Design-like in usability, Kabbalah-like in symbolic architecture, and Hermetic in metaphysical grammar.

```ts
type HumanGuide = {
  metaFrame: {
    world: "living-cosmos";
    doctrinePolicy: "non-doctrinal" | "multi-witness" | "practice-oriented";
    sourceMode: "local-corpus-grounded";
    engineVersion: string;
  };
  sourceProvenance: SourceUse[];
  openingMirror: {
    title: string;
    thesis: string;
    chartBasis: string[];
  };
  ageOfConsciousness: {
    transitionTheme: string;
    oldPattern: string;
    emergingFaculty: string;
    personalQuestion: string;
  };
  birthSeal: {
    bigThree: GuideSection;
    chartRuler: GuideSection;
    dominantPattern: GuideSection;
    sacredTension: GuideSection;
  };
  internalMap: {
    root: MapNode;
    bodyTemple: MapNode;
    heartChamber: MapNode;
    voiceAndMind: MapNode;
    crownAndStar: MapNode;
    shadowGate: MapNode;
    serviceGate: MapNode;
    inspirationGate: MapNode;
    paths: MapPath[];
  };
  innerArchitecture: {
    body: GuideSection;
    mind: GuideSection;
    heart: GuideSection;
    will: GuideSection;
    shadow: GuideSection;
    vocation: GuideSection;
    divineListening: GuideSection;
  };
  planetaryRooms: PlanetaryRoom[];
  housePilgrimage?: HouseGuide[];
  allegoricalMap: {
    desert: GuideSection;
    garden: GuideSection;
    tower: GuideSection;
    threshold: GuideSection;
    lamp: GuideSection;
    wound: GuideSection;
    vow: GuideSection;
  };
  shadowWithMercy: {
    pattern: string;
    distortion: string;
    mercy: string;
    practice: string;
  };
  directInspiration: {
    listeningStyle: string;
    obstruction: string;
    invitation: string;
    practice: string;
  };
  practicalCounsel: {
    dailyPractice: string[];
    contemplation: string[];
    relationshipPractice: string[];
    workPractice: string[];
    restraint: string[];
    offering: string[];
  };
  guideSummary: {
    whenLost: string;
    whenAfraid: string;
    whenCalled: string;
    oneSentenceVow: string;
  };
  disclaimer: string;
};
```

`GuideSection` should include `text`, `chartBasis`, `sourceBasis`, and `practice`. This keeps richness tied to evidence.

`MapNode` should include `name`, `theme`, `chartBasis`, `sourceBasis`, `gift`, `distortion`, `practice`, and `mantra`. `MapPath` should include `from`, `to`, `tension`, `medicine`, `chartBasis`, and `practice`.

Recommended internal map nodes:

- `root`: incarnation, body, ancestry, survival, stability.
- `bodyTemple`: desire, instinct, pleasure, appetite, embodiment.
- `heartChamber`: attachment, mercy, grief, beauty, relationship.
- `voiceAndMind`: perception, language, thought, study, signal.
- `crownAndStar`: meaning, divine listening, inspiration, prayer, vision.
- `shadowGate`: fear, compulsion, shame, fragmentation, avoidance.
- `serviceGate`: vocation, offering, discipline, craft, usefulness.
- `inspirationGate`: direct knowing, subtle perception, inner teacher.

The map should let the user say, "This is where I am standing inside myself today."

## Phase 2: Chart Intelligence

Create a chart-analysis layer between calculation and writing. It should turn natal chart facts into symbolic diagnostics.

Required analysis groups:

- `correspondences`: outer chart pattern to inner life pattern.
- `developmentalTasks`: what is asking to mature.
- `integrationTensions`: squares, oppositions, hard configurations, afflicted rulers, and shadow conflicts.
- `graceChannels`: gifts, ease, coherent planetary condition, and natural wisdom.
- `practiceNeeds`: what ancient counsel fits the user's chart.
- `directInspirationStyle`: how the user is most likely to receive insight.
- `allegoryAssignments`: desert, garden, tower, threshold, lamp, wound, and vow themes derived from chart facts.
- `internalMapAssignments`: chart-derived placement of planets, houses, rulers, and aspect tensions into internal map nodes and paths.
- `ageTransitionSignatures`: old pattern, emerging faculty, and transition pressure without claiming a single doctrine.

Required astrological computations:

- Sect/day-night chart.
- Asc, MC, Desc, IC.
- Chart ruler and ruler condition.
- Essential dignity and debility.
- House rulers and dispositors.
- Angularity and planetary strength.
- Applying and separating aspects.
- Aspect patterns and tightest tensions.
- Element, modality, hemisphere, and quadrant balance.
- Nodes, Chiron, Part of Fortune.
- Saturn and Jupiter condition.
- Mercury, Uranus, Neptune emphasis for perception, imagination, subtle awareness, and transitional consciousness.

The chart-analysis API should produce deterministic structured data. The LLM should interpret and write, not invent the analysis.

Internal map assignment guidance:

- Sun, chart ruler, and MC help define crown/star and service-gate themes.
- Moon, IC, 4th house, and water emphasis help define root, body-temple, and heart-chamber needs.
- Mercury, 3rd/9th houses, air emphasis, and Uranus help define voice/mind and inspiration-gate style.
- Venus, 5th/7th houses, and benefic dignity help define heart-chamber gifts.
- Mars, Saturn, hard aspects, 6th/8th/12th houses, and South Node help define shadow-gate and discipline paths.
- Jupiter, 9th house, North Node, and coherent trines help define meaning, faith, blessing, and expansion paths.
- Aspects become paths between nodes, not merely isolated interpretations.

## Phase 1: Calculation Truth

Phase 1 makes the chart trustworthy enough to support symbolic depth.

Use Swiss Ephemeris as the canonical production engine, subject to licensing. The current approximate engine may remain for offline development and tests, but production Human Guide output should know whether it is based on canonical or approximate calculations.

Required chart metadata:

- `engineId`
- `engineVersion`
- `ephemerisSource`
- `calculationConfidence`
- `houseSystem`
- `zodiacMode`
- `timezoneSource`
- `birthMomentUtc`
- `julianDay`
- `calculatedAt`

Required validation:

- Golden chart fixtures against trusted external chart data.
- DST and timezone edge cases.
- High-latitude house behavior.
- Unknown birth time behavior.
- Whole-sign and Placidus behavior.
- Optional point behavior.
- Aspect detection with configurable orbs.

The product explanation should be modest:

> We calculate carefully so the reflection is clean. The chart is not a prison; it is a mirror.

## Reading Pipeline

1. Calculate canonical chart.
2. Validate chart schema and metadata.
3. Run chart-analysis.
4. Build section-specific retrieval queries from chart-analysis, not only raw placements.
5. Retrieve from approved local source families.
6. Generate Human Guide JSON from schema.
7. Validate schema.
8. Audit source provenance.
9. Cache by chart hash, source index version, brand, and guide version.

## Brand Relationship

Brands should be lenses over the same Living Cosmos, not separate systems.

- JupiterSeek: meaning, blessing, expansion, pilgrimage, wisdom, generosity.
- SaturnSeer: discipline, boundary, time, vow, mastery, sober love.
- SaturnLeo: creative authority, radiance, craft, courage, noble restraint.
- Future planet brands should each let one planetary intelligence speak through the shared guide.

## Voice Rules

Use:

- thoughtful, luminous, grounded, allegorical language.
- practical ancient counsel.
- symbolic confidence with epistemic humility.
- mercy before diagnosis.
- direct inspiration without coercion.

Avoid:

- deterministic fate claims.
- fear, doom, curses, spiritual threat, or diagnosis.
- institutional religious authority.
- generic AI self-help phrasing.
- purely mechanical chart-to-text templating.
- claiming sources that were not retrieved.

## Testing And Quality

Phase 1 tests prove calculation quality.

Phase 2 tests prove analysis determinism: the same chart should yield the same symbolic diagnostics.

Phase 3 tests prove schema validity, source provenance, doctrine neutrality, and voice constraints.

Create fixture charts for:

- time known, time unknown, high latitude, strong Saturn, strong Jupiter, heavy water, heavy air, angular Sun, angular Moon, stellium, and hard Saturn/Moon.

Review generated output against:

- chart grounding
- richness
- non-doctrinal language
- source provenance
- practical usefulness
- absence of fear or spiritual coercion

## Open Source-Corpus Gap

`The Holy Science`, Seth/Jane Roberts texts, and direct Kabbalah source texts were not found in the local corpus during discovery. If any should become grounded sources rather than influences/preferences, add source texts under `/data/runtipi/media/data/web-astro` and rebuild the esoterica index.

## Approval Gate

This design covers the implementation target for phases 1, 2, and 3. After approval, the next step is a detailed implementation plan that breaks this into safe commits and verification checkpoints.
