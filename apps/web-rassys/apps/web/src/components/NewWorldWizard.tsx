"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const toneOptions = ["Mythic", "Neon Noir", "Hopepunk", "Bleak", "Whimsical", "Gritty"];
const genreOptions = ["Arcane Sci-Fi", "High Fantasy", "Cosmic Horror", "Dieselpunk", "Dreamscape"];
const pacingOptions = ["Story-first", "Balanced", "Tactical"];

const factionTags = ["Sky Guild", "Rift Court", "Glass Nomads", "Storm Priests", "Signal Syndicate"];
const threatTags = ["Reality bleed", "Rogue AI", "Ancient gods", "Mutant storms", "Clockwork plague"];

const partyTags = ["Explorers", "Outlaws", "Scholars", "Mercenaries", "Chosen", "Rebels"];
const stakesTags = ["Save a city", "Uncover a secret", "Survive a heist", "Stop a war", "Recover a relic"];

const steps = ["Seed", "Pressure", "Hook", "Review"];

type System = {
  id: string;
  name: string;
  description?: string;
  rulesPrimer?: string;
  manualCount: number;
  categories: Record<string, number | undefined>;
  sampleTitles: string[];
};

export type NewWorldSeed = {
  systemId: string;
  worldName: string;
  genre: string;
  tone: string;
  pacing: string;
  factions: string[];
  threat: string[];
  techLevel: string;
  landmark: string;
  partyFocus: string[];
  stakes: string[];
  startingPoint: string;
  tableLines: string;
  openingSituation: string;
  playerHook: string;
  campaignTwist: string;
};

type NewWorldWizardProps = {
  systems: System[];
  initialSystemId?: string;
  onSystemChange?: (systemId: string) => void;
  onGenerateWorld?: (seed: NewWorldSeed) => void | Promise<void>;
  generating?: boolean;
};

type WorldRoutinePreset = {
  genre: readonly string[];
  tone: readonly string[];
  pacing: readonly string[];
  factions: readonly string[];
  threats: readonly string[];
  partyFocus: readonly string[];
  stakes: readonly string[];
  techLevels: readonly string[];
  startingPoints: readonly string[];
  landmarks: readonly string[];
  openingSituations: readonly string[];
  playerHooks: readonly string[];
  twists: readonly string[];
  worldNameLeft: readonly string[];
  worldNameRight: readonly string[];
  defaultTableLines: string;
};

const gammaWorldPreset: WorldRoutinePreset = {
  genre: ["Arcane Sci-Fi", "Dieselpunk", "Dreamscape"],
  tone: ["Gritty", "Hopepunk", "Bleak"],
  pacing: ["Balanced", "Story-first", "Tactical"],
  factions: ["Rift Court", "Glass Nomads", "Storm Priests", "Signal Syndicate", "Scrap Barons"],
  threats: ["Mutant storms", "Reality bleed", "Rogue AI", "Ancient gods", "Gene-bred raiders"],
  partyFocus: ["Explorers", "Rebels", "Mercenaries", "Scholars"],
  stakes: ["Recover a relic", "Save a city", "Uncover a secret", "Stop a war"],
  techLevels: [
    "Salvage tech, bio-mutations, and dangerous relic systems",
    "Patchwork future ruins with unstable science-fantasy hardware",
    "Rusting megastructure tech mixed with weird mutation fallout"
  ],
  startingPoints: ["Stormwatch Outpost", "The Chrome Flats", "Signal Spire Nine", "The Dustline Bazaar"],
  landmarks: [
    "A shattered skybridge over a radioactive salt basin",
    "A pulse-reactor cathedral flickering under stormclouds",
    "A fossilized titan wrapped in scavenger scaffolds"
  ],
  openingSituations: [
    "A salvage treaty is collapsing just as a lethal weather front rolls in.",
    "A faction convoy arrives carrying a relic everyone recognizes and nobody should touch.",
    "A safe settlement goes dark for one minute, and something comes back with the power."
  ],
  playerHooks: [
    "The party is the only crew with the route knowledge to reach the crisis in time.",
    "Someone in the outpost believes the party can decode the relic before the factions tear each other apart.",
    "The opening job looks profitable until it becomes the only thing standing between civilians and catastrophe."
  ],
  twists: [
    "The relic is responding to one of the party members specifically.",
    "The faction that looks most stable is already compromised from within.",
    "The storm is not weather. It is a pattern trying to wake up."
  ],
  worldNameLeft: ["Meridian", "Ash", "Chrome", "Rift", "Storm", "Static"],
  worldNameRight: ["Frontier", "Spindle", "Expanse", "Reach", "Hollow", "Drift"],
  defaultTableLines: "No graphic gore, no harm to children, keep body horror suggestive rather than explicit"
};

const fantasyPreset: WorldRoutinePreset = {
  genre: ["High Fantasy", "Dreamscape", "Arcane Sci-Fi"],
  tone: ["Mythic", "Whimsical", "Gritty"],
  pacing: ["Story-first", "Balanced", "Tactical"],
  factions: ["Sky Guild", "Rift Court", "Glass Nomads", "Storm Priests", "Crownless Houses"],
  threats: ["Ancient gods", "Clockwork plague", "Reality bleed", "Famine cults", "Dragonfire omens"],
  partyFocus: ["Chosen", "Explorers", "Scholars", "Outlaws"],
  stakes: ["Stop a war", "Recover a relic", "Save a city", "Uncover a secret"],
  techLevels: [
    "Ancient magic, pilgrimage roads, and relic-forged wonders",
    "High fantasy kingdoms with dangerous spellcraft and living myth",
    "Sword-and-sorcery realms threaded with old cosmic machinery"
  ],
  startingPoints: ["Saint's Crossing", "Moonwake Harbor", "The Ivory March", "Ashen Keep"],
  landmarks: [
    "A suspended citadel anchored by chains of living light",
    "A moonlit forest where every path remembers a different empire",
    "A broken observatory built into the ribs of a dead dragon"
  ],
  openingSituations: [
    "A sacred truce fails in public, and everyone looks to the nearest armed outsiders.",
    "A festival night ends when a missing relic starts singing beneath the city.",
    "An omen arrives early, and the people who were supposed to interpret it are already dead."
  ],
  playerHooks: [
    "The party holds the map, bloodline, or debt that makes them impossible to replace.",
    "A patron offers the party their best chance at glory, but only if they act before sunrise.",
    "Someone the party cannot ignore is already entangled in the crisis."
  ],
  twists: [
    "The prophecy everyone fears was planted by mortal hands.",
    "The enemy has a defensible claim to the thing the heroes need.",
    "The relic is not lost. It is hiding from what it was built to stop."
  ],
  worldNameLeft: ["Moon", "Ember", "Silver", "Star", "Thorn", "Myth"],
  worldNameRight: ["Crown", "March", "Reach", "Vale", "Harbor", "Sanctum"],
  defaultTableLines: "Fade to black on torture, avoid sexual violence, keep horror atmospheric rather than graphic"
};

const horrorPreset: WorldRoutinePreset = {
  genre: ["Cosmic Horror", "Dreamscape", "High Fantasy"],
  tone: ["Bleak", "Mythic", "Gritty"],
  pacing: ["Story-first", "Balanced", "Tactical"],
  factions: ["Ashen Lodge", "Rift Court", "Whisper Office", "Glass Nomads", "The Last Trustees"],
  threats: ["Ancient gods", "Reality bleed", "Clockwork plague", "Sleepwalking cults", "Forbidden scripture"],
  partyFocus: ["Scholars", "Explorers", "Outlaws", "Rebels"],
  stakes: ["Uncover a secret", "Save a city", "Survive a heist", "Stop a war"],
  techLevels: [
    "Gaslight institutions, private archives, and occult machinery",
    "Scholarly dread with ritual science and cracking social order",
    "Late-industrial horror threaded with impossible symbols"
  ],
  startingPoints: ["Blackwater Station", "Low Chapel", "The Mirror Quarter", "Saint Vesper Hospital"],
  landmarks: [
    "A tidal cathedral whose bell rings before anyone pulls the rope",
    "A library wing sealed behind salt and iron for generations",
    "A harbor lighthouse that now points inland"
  ],
  openingSituations: [
    "A body arrives with evidence of a crime that has not happened yet.",
    "A respected authority quietly begs the party to investigate something too shameful to report.",
    "An entire district loses one shared memory on the same night."
  ],
  playerHooks: [
    "The party is tied to the case by witness testimony, debt, or prior contact with the impossible.",
    "The only surviving clue makes sense to the party and nobody else.",
    "Someone the party cares about is already marked by whatever is coming through."
  ],
  twists: [
    "The safest witness is the one lying most convincingly.",
    "The thing haunting the city is trying to warn it, not destroy it.",
    "The first monster is only the symptom of a much older bargain."
  ],
  worldNameLeft: ["Black", "Grave", "Vesper", "Hollow", "Morrow", "Pale"],
  worldNameRight: ["Tide", "Archive", "Ward", "Station", "Cathedral", "Harbor"],
  defaultTableLines: "No explicit torture, no cruelty to children, keep self-harm and body horror off-screen"
};

const sciencePreset: WorldRoutinePreset = {
  genre: ["Arcane Sci-Fi", "Neon Noir", "Dieselpunk"],
  tone: ["Neon Noir", "Gritty", "Hopepunk"],
  pacing: ["Balanced", "Tactical", "Story-first"],
  factions: ["Signal Syndicate", "Sky Guild", "Glass Nomads", "Rift Court", "Orbital Customs"],
  threats: ["Rogue AI", "Reality bleed", "Clockwork plague", "Corporate black ops", "Solar storms"],
  partyFocus: ["Mercenaries", "Explorers", "Outlaws", "Scholars"],
  stakes: ["Survive a heist", "Uncover a secret", "Recover a relic", "Stop a war"],
  techLevels: [
    "Corporate sprawl, black-market implants, and humming transit grids",
    "Frontier colonies patched together with forbidden hardware and old code",
    "Neon undercities and orbital debris economies held together by bad deals"
  ],
  startingPoints: ["Dock 7 Meridian", "Halo Transit Yard", "Night Market Theta", "Old Sun Relay"],
  landmarks: [
    "A ring elevator frozen over a dead city",
    "A scrap-built district hanging beneath a maglev spine",
    "A listening tower tuned to signals nobody admits hearing"
  ],
  openingSituations: [
    "A routine pickup becomes a public firefight the moment the payload wakes up.",
    "A shutdown order hits the district while thousands of people still depend on the grid.",
    "Someone wipes a corporate archive and leaves only one breadcrumb pointing to the party."
  ],
  playerHooks: [
    "The party is the only team fast enough and deniable enough to move before the window closes.",
    "A fixer makes the wrong people angry in the party's direction.",
    "The job turns personal when the missing asset knows one of the party by name."
  ],
  twists: [
    "The stolen tech is carrying a map to something far more dangerous than itself.",
    "The rival crew is trying to stop a cover-up, not cash in on it.",
    "The city outage was engineered to hide one very precise extraction."
  ],
  worldNameLeft: ["Signal", "Neon", "Halo", "Static", "Velvet", "Orbit"],
  worldNameRight: ["Run", "Circuit", "Spindle", "Drift", "Array", "Break"],
  defaultTableLines: "No sexual violence, no graphic mutilation, keep interrogation pressure non-explicit"
};

const genericPreset: WorldRoutinePreset = {
  genre: genreOptions,
  tone: toneOptions,
  pacing: pacingOptions,
  factions: factionTags,
  threats: threatTags,
  partyFocus: partyTags,
  stakes: stakesTags,
  techLevels: [
    "Layered cultures, contested resources, and one piece of power nobody fully understands",
    "A world in transition where old rules are failing faster than new ones can replace them",
    "A setting where local survival and bigger mythic patterns collide"
  ],
  startingPoints: ["Stormwatch Outpost", "Lantern Crossing", "The Edge Market", "Broken Gate Station"],
  landmarks: [
    "A skyline cut by one impossible structure everyone uses but nobody understands",
    "A sacred ruin turned into a settlement the world should have left alone",
    "A horizon landmark that changes meaning depending on who tells the story"
  ],
  openingSituations: [
    "A fragile status quo breaks in public and the party is suddenly inside it.",
    "A promised handoff goes wrong, leaving the party holding the only useful lead.",
    "The first quiet day in weeks ends with a problem no one can ignore."
  ],
  playerHooks: [
    "The party is the only group already in position when the trouble starts.",
    "Someone trusts the party more than they probably should.",
    "The opening problem touches something the party already cares about."
  ],
  twists: [
    "The obvious villain is covering for the real fracture in the setting.",
    "The truth behind the crisis is older and more local than anyone expects.",
    "Solving the problem quickly might actually make the world worse."
  ],
  worldNameLeft: ["Meridian", "Lantern", "Echo", "Storm", "Glass", "Iron"],
  worldNameRight: ["Reach", "Rift", "Frontier", "Harbor", "Crossing", "Hollow"],
  defaultTableLines: "No sexual violence, avoid graphic gore, keep cruelty to children off the table"
};

const normalizeSystemKey = (systemId: string, systemName?: string) =>
  `${systemId} ${systemName ?? ""}`.trim().toLowerCase();

const resolvePreset = (systemId: string, systemName?: string): WorldRoutinePreset => {
  const key = normalizeSystemKey(systemId, systemName);
  if (key.includes("gamma")) return gammaWorldPreset;
  if (key.includes("cthulhu") || key.includes("horror")) return horrorPreset;
  if (key.includes("alternity") || key.includes("cyber") || key.includes("science") || key.includes("star")) {
    return sciencePreset;
  }
  if (
    key.includes("dnd") ||
    key.includes("ars") ||
    key.includes("merp") ||
    key.includes("magica") ||
    key.includes("hackmaster") ||
    key.includes("fantasy")
  ) {
    return fantasyPreset;
  }
  return genericPreset;
};

const randomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

const pickMany = <T,>(items: readonly T[], count: number) => {
  const pool = [...items];
  const picks: T[] = [];
  while (pool.length > 0 && picks.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
};

const buildWorldName = (preset: WorldRoutinePreset) => `${randomItem(preset.worldNameLeft)} ${randomItem(preset.worldNameRight)}`;

const sentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const mergeChips = (...groups: ReadonlyArray<readonly string[]>) =>
  Array.from(new Set(groups.flatMap((group) => [...group].filter((value) => value.trim().length > 0))));

export function NewWorldWizard({
  systems,
  initialSystemId,
  onSystemChange,
  onGenerateWorld,
  generating = false
}: NewWorldWizardProps) {
  const [step, setStep] = useState(0);
  const [systemId, setSystemId] = useState(initialSystemId ?? systems[0]?.id ?? "custom");
  const [worldName, setWorldName] = useState("Meridian Rift");
  const [genre, setGenre] = useState(genreOptions[0]);
  const [tone, setTone] = useState(toneOptions[1]);
  const [pacing, setPacing] = useState(pacingOptions[1]);
  const [factions, setFactions] = useState<string[]>(["Rift Court", "Glass Nomads"]);
  const [threat, setThreat] = useState<string[]>(["Reality bleed"]);
  const [techLevel, setTechLevel] = useState("Arcane tech, synth-infused relics");
  const [landmark, setLandmark] = useState("A shattered skybridge above a luminous desert");
  const [partyFocus, setPartyFocus] = useState<string[]>(["Explorers"]);
  const [stakes, setStakes] = useState<string[]>(["Recover a relic"]);
  const [startingPoint, setStartingPoint] = useState("Stormwatch Outpost");
  const [tableLines, setTableLines] = useState("No graphic gore, no harm to children");
  const [openingSituation, setOpeningSituation] = useState(
    "A fragile salvage accord is collapsing as the first real sign of danger arrives."
  );
  const [playerHook, setPlayerHook] = useState(
    "The party is the only crew already close enough to step in before the whole place tears itself apart."
  );
  const [campaignTwist, setCampaignTwist] = useState(
    "The thing everyone fears is also the only clue to what is really going wrong."
  );
  const [worldNameTouched, setWorldNameTouched] = useState(false);
  const [hydratedSystemId, setHydratedSystemId] = useState<string | null>(null);

  const canBack = step > 0;
  const canNext = step < steps.length - 1;

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);
  const activeSystem = useMemo(
    () => systems.find((system) => system.id === systemId) ?? systems[0],
    [systemId, systems]
  );
  const activePreset = useMemo(
    () => resolvePreset(systemId, activeSystem?.name),
    [activeSystem?.name, systemId]
  );
  const categoryCounts = useMemo(() => activeSystem?.categories ?? {}, [activeSystem]);
  const categoryEntries = useMemo(
    () =>
      Object.entries(categoryCounts)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .sort((a, b) => b[1] - a[1]),
    [categoryCounts]
  );
  const factionOptions = useMemo(
    () => mergeChips(factionTags, activePreset.factions, factions),
    [activePreset.factions, factions]
  );
  const threatOptions = useMemo(
    () => mergeChips(threatTags, activePreset.threats, threat),
    [activePreset.threats, threat]
  );
  const partyOptions = useMemo(
    () => mergeChips(partyTags, activePreset.partyFocus, partyFocus),
    [activePreset.partyFocus, partyFocus]
  );
  const stakesOptions = useMemo(
    () => mergeChips(stakesTags, activePreset.stakes, stakes),
    [activePreset.stakes, stakes]
  );

  const applyFlavor = useCallback((preset: WorldRoutinePreset, keepWorldName = false) => {
    if (!keepWorldName || !worldName.trim()) {
      setWorldName(buildWorldName(preset));
    }
    setGenre(preset.genre[0] ?? genreOptions[0]);
    setTone(preset.tone[0] ?? toneOptions[0]);
    setPacing(preset.pacing[0] ?? pacingOptions[0]);
    setFactions([...preset.factions].slice(0, 2));
    setThreat([...preset.threats].slice(0, 2));
    setTechLevel(preset.techLevels[0] ?? "");
    setLandmark(preset.landmarks[0] ?? "");
    setPartyFocus([...preset.partyFocus].slice(0, 1));
    setStakes([...preset.stakes].slice(0, 2));
    setStartingPoint(preset.startingPoints[0] ?? "");
    setTableLines(preset.defaultTableLines);
    setOpeningSituation(preset.openingSituations[0] ?? "");
    setPlayerHook(preset.playerHooks[0] ?? "");
    setCampaignTwist(preset.twists[0] ?? "");
    setHydratedSystemId(systemId);
  }, [systemId, worldName]);

  const surpriseMe = () => {
    setWorldName(buildWorldName(activePreset));
    setGenre(randomItem(activePreset.genre));
    setTone(randomItem(activePreset.tone));
    setPacing(randomItem(activePreset.pacing));
    setFactions(pickMany(activePreset.factions, 2));
    setThreat(pickMany(activePreset.threats, 2));
    setTechLevel(randomItem(activePreset.techLevels));
    setLandmark(randomItem(activePreset.landmarks));
    setPartyFocus(pickMany(activePreset.partyFocus, 2));
    setStakes(pickMany(activePreset.stakes, 2));
    setStartingPoint(randomItem(activePreset.startingPoints));
    setTableLines(activePreset.defaultTableLines);
    setOpeningSituation(randomItem(activePreset.openingSituations));
    setPlayerHook(randomItem(activePreset.playerHooks));
    setCampaignTwist(randomItem(activePreset.twists));
  };

  useEffect(() => {
    const preferredSystemId = initialSystemId ?? systems[0]?.id ?? "custom";
    if (!systems.some((system) => system.id === systemId) || (initialSystemId && initialSystemId !== systemId)) {
      setSystemId(preferredSystemId);
    }
  }, [initialSystemId, systemId, systems]);

  useEffect(() => {
    if (!activeSystem || hydratedSystemId === systemId) return;
    applyFlavor(activePreset, worldNameTouched);
  }, [activePreset, activeSystem, applyFlavor, hydratedSystemId, systemId, worldNameTouched]);

  const toggle = (value: string, setState: (items: string[]) => void, items: string[]) => {
    setState(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  };

  const reviewSummary = useMemo(
    () =>
      [
        `${worldName} is a ${genre.toLowerCase()} campaign with a ${tone.toLowerCase()} pulse.`,
        sentence(openingSituation),
        sentence(playerHook),
        campaignTwist.trim() ? `Hidden truth: ${sentence(campaignTwist)}` : ""
      ]
        .filter((value) => value.length > 0)
        .join(" "),
    [campaignTwist, genre, openingSituation, playerHook, tone, worldName]
  );

  const stepIsReady =
    (step === 0 && worldName.trim().length >= 2) ||
    (step === 1 && landmark.trim().length >= 4 && openingSituation.trim().length >= 10) ||
    (step === 2 && startingPoint.trim().length >= 2 && playerHook.trim().length >= 10) ||
    step === 3;

  return (
    <div className="glass-panel rounded-3xl p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-cloud/60">New World Wizard</div>
          <h2 className="section-title text-3xl">
            Build a <span className="magical-text">persistent</span> sandbox
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/60">
          {steps.map((label, index) => (
            <span
              key={label}
              className={cn(
                "rave-chip rounded-full px-3 py-2",
                index === step ? "text-white" : "text-cloud/60"
              )}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 h-2 w-full rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(120deg,var(--accent),var(--accent-2),var(--accent-3))] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-6 grid gap-6">
        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Seed the Spark</div>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-cloud/70">
                  Game system
                  <select
                    className="rave-input rounded-2xl px-4 py-3"
                    value={systemId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSystemId(next);
                      onSystemChange?.(next);
                    }}
                  >
                    {systems.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.28em]"
                    onClick={() => applyFlavor(activePreset)}
                    type="button"
                  >
                    Load {activeSystem?.name ?? "System"} Flavor
                  </button>
                  <button
                    className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.28em]"
                    onClick={surpriseMe}
                    type="button"
                  >
                    Surprise Me
                  </button>
                </div>

                <label className="grid gap-2 text-sm text-cloud/70">
                  World name
                  <input
                    className="rave-input rounded-2xl px-4 py-3"
                    value={worldName}
                    onChange={(event) => {
                      setWorldNameTouched(true);
                      setWorldName(event.target.value);
                    }}
                  />
                </label>

                <label className="grid gap-2 text-sm text-cloud/70">
                  Genre
                  <select
                    className="rave-input rounded-2xl px-4 py-3"
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                  >
                    {genreOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-cloud/70">
                  Tone
                  <div className="flex flex-wrap gap-2">
                    {toneOptions.map((option) => (
                      <button
                        key={option}
                        className={cn(
                          "rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.3em]",
                          option === tone ? "text-white" : "text-cloud/60"
                        )}
                        onClick={() => setTone(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>

            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Rules Library</div>
              <div className="mt-3 text-sm text-cloud/80">
                {activeSystem?.description || `Manuals found for ${activeSystem?.name ?? "this system"}.`}
              </div>
              {activeSystem?.rulesPrimer && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-cloud/70">
                  {activeSystem.rulesPrimer}
                </div>
              )}
              <div className="mt-3 text-xs text-cloud/60">
                {activeSystem?.manualCount ?? 0} manuals indexed.
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/70">
                {categoryEntries.map(([category, count]) => (
                  <span key={category} className="rave-chip rounded-full px-3 py-2">
                    {category} · {count}
                  </span>
                ))}
                {!Object.keys(categoryCounts).length && (
                  <span className="rave-chip rounded-full px-3 py-2">No manuals indexed</span>
                )}
              </div>
              <div className="mt-5 text-xs text-cloud/60">
                World creation now carries your seed forward as pinned canon, so the DM can keep honoring the premise after turn one.
              </div>
              <div className="mt-4 grid gap-2 text-xs text-cloud/60">
                {activeSystem?.sampleTitles?.slice(0, 4).map((title) => (
                  <div key={title} className="rave-chip rounded-2xl px-3 py-2">
                    {title}
                  </div>
                ))}
              </div>
              <div className="mt-6 text-xs uppercase tracking-[0.3em] text-cloud/60">Pacing</div>
              <div className="mt-4 grid gap-3">
                {pacingOptions.map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "rave-chip rounded-2xl px-4 py-3 text-sm uppercase tracking-[0.25em]",
                      option === pacing ? "text-white" : "text-cloud/60"
                    )}
                    onClick={() => setPacing(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="mt-4 text-xs text-cloud/60">
                Pick how much the DM should prioritize narrative flow versus tactical consequence tracking.
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Factions in Motion</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {factionOptions.map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.3em]",
                      factions.includes(option) ? "text-white" : "text-cloud/60"
                    )}
                    onClick={() => toggle(option, setFactions, factions)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Tech / Magic texture
                <input
                  className="rave-input rounded-2xl px-4 py-3"
                  value={techLevel}
                  onChange={(event) => setTechLevel(event.target.value)}
                />
              </label>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Opening situation
                <textarea
                  className="rave-input h-28 resize-none rounded-2xl px-4 py-3"
                  value={openingSituation}
                  onChange={(event) => setOpeningSituation(event.target.value)}
                />
              </label>
            </div>

            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Threat Vector</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {threatOptions.map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.3em]",
                      threat.includes(option) ? "text-white" : "text-cloud/60"
                    )}
                    onClick={() => toggle(option, setThreat, threat)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Signature landmark
                <textarea
                  className="rave-input h-24 resize-none rounded-2xl px-4 py-3"
                  value={landmark}
                  onChange={(event) => setLandmark(event.target.value)}
                />
              </label>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-cloud/65">
                Make the first pressure immediate and visible. If the party walked in right now, what would already be in motion?
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Party Hook</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {partyOptions.map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.3em]",
                      partyFocus.includes(option) ? "text-white" : "text-cloud/60"
                    )}
                    onClick={() => toggle(option, setPartyFocus, partyFocus)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Starting location
                <input
                  className="rave-input rounded-2xl px-4 py-3"
                  value={startingPoint}
                  onChange={(event) => setStartingPoint(event.target.value)}
                />
              </label>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Why the party must care
                <textarea
                  className="rave-input h-28 resize-none rounded-2xl px-4 py-3"
                  value={playerHook}
                  onChange={(event) => setPlayerHook(event.target.value)}
                />
              </label>
            </div>

            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Stakes and Canon</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {stakesOptions.map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.3em]",
                      stakes.includes(option) ? "text-white" : "text-cloud/60"
                    )}
                    onClick={() => toggle(option, setStakes, stakes)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Hidden complication or twist
                <textarea
                  className="rave-input h-24 resize-none rounded-2xl px-4 py-3"
                  value={campaignTwist}
                  onChange={(event) => setCampaignTwist(event.target.value)}
                />
              </label>
              <label className="mt-5 grid gap-2 text-sm text-cloud/70">
                Table lines & veils
                <textarea
                  className="rave-input h-24 resize-none rounded-2xl px-4 py-3"
                  value={tableLines}
                  onChange={(event) => setTableLines(event.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4">
              <div className="rave-panel rounded-3xl p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">World Pulse</div>
                <div className="mt-4 grid gap-3 text-sm text-cloud/80">
                  <div className="rave-chip rounded-2xl px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Identity</div>
                    <div className="mt-1 text-white">
                      {worldName} · {genre} · {tone}
                    </div>
                    <div className="mt-1">{pacing} pacing · {techLevel}</div>
                  </div>
                  <div className="rave-chip rounded-2xl px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Opening Pressure</div>
                    <div className="mt-1">{openingSituation}</div>
                    <div className="mt-2 text-xs text-cloud/60">Landmark: {landmark}</div>
                  </div>
                  <div className="rave-chip rounded-2xl px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Hook and Stakes</div>
                    <div className="mt-1">{playerHook}</div>
                    <div className="mt-2">Factions: {factions.join(", ") || "Local powers"}</div>
                    <div className="mt-1">Threats: {threat.join(", ") || "A pressure gathering off-screen"}</div>
                    <div className="mt-1">Stakes: {stakes.join(", ") || "Hold onto something worth saving"}</div>
                  </div>
                </div>
              </div>

              <div className="rave-panel rounded-3xl p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">World Brief</div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-cloud/80">
                  {reviewSummary}
                </div>
              </div>
            </div>

            <div className="rave-panel rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Launch</div>
              <div className="mt-4 grid gap-4 text-sm text-cloud/80">
                <div className="rave-chip rounded-2xl px-4 py-3">
                  Starting point: {startingPoint}
                </div>
                <div className="rave-chip rounded-2xl px-4 py-3">
                  Hidden twist: {campaignTwist}
                </div>
                <div className="rave-chip rounded-2xl px-4 py-3">Table safety: {tableLines}</div>
                <div className="text-xs text-cloud/60">
                  Creating the campaign now will pin this seed into campaign memory, shape the first world state, and hand the DM a stronger opening scene.
                </div>
                <Button
                  onClick={() => {
                    void onGenerateWorld?.({
                      systemId,
                      worldName,
                      genre,
                      tone,
                      pacing,
                      factions,
                      threat,
                      techLevel,
                      landmark,
                      partyFocus,
                      stakes,
                      startingPoint,
                      tableLines,
                      openingSituation,
                      playerHook,
                      campaignTwist
                    });
                  }}
                  disabled={
                    generating ||
                    !worldName.trim() ||
                    !startingPoint.trim() ||
                    !openingSituation.trim() ||
                    !playerHook.trim()
                  }
                >
                  {generating ? "Generating..." : "Generate World"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
          Step {step + 1} of {steps.length}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={!canBack} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button disabled={!canNext || !stepIsReady} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
