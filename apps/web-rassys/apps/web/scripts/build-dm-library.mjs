import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const dataRoot = path.join(webRoot, "data");
const sourceDataRoot = path.join(webRoot, "src", "data");
const root = process.argv[2] || process.env.DM_LIBRARY_ROOT || "/media/roleplay";
const fullOutput = process.argv[3] || path.join(dataRoot, "dm-library.json");
const summaryOutput = path.join(sourceDataRoot, "dm-library-summary.json");

const manualPatterns = [
  /player(?:'s)? handbook/i,
  /players handbook/i,
  /player(?:'s)? guide/i,
  /dungeon master/i,
  /game master/i,
  /\bgm\b/i,
  /rulebook/i,
  /\bcore\b/i,
  /\brules\b/i,
  /\bsrd\b/i,
  /monster manual/i,
  /bestiary/i,
  /\bspells?\b/i,
  /spellbook/i,
  /equipment|weapons?|armory|gear|items?/i,
  /compendium/i,
  /codex/i
];

const excludePatterns = [
  /\badventure\b/i,
  /\bmodule\b/i,
  /\bscenario\b/i,
  /\bquest\b/i,
  /\bcampaign\b/i,
  /\badv\b/i
];

const systemMatchers = [
  {
    id: "dnd-4e",
    name: "D&D 4e",
    match: (full, name) =>
      full.includes("dnd_4th_completecollection") || name.includes("d&d 4.0") || name.includes("4th edition")
  },
  {
    id: "dnd-35e",
    name: "D&D 3.5e",
    match: (full, name) => full.includes("3.5e") || name.includes("3.5")
  },
  {
    id: "dnd-30",
    name: "D&D 3.0",
    match: (_full, name) => name.includes("d&d 3.0") || name.includes("d&d 3e")
  },
  {
    id: "adnd-1e",
    name: "AD&D 1e",
    match: (_full, name) => name.includes("ad&d 1.0") || name.includes("ad&d 1e") || name.includes("ad&d")
  },
  {
    id: "dnd-1e",
    name: "D&D 1e",
    match: (_full, name) => name.includes("d&d 1.0") || name.includes("d&d 1e")
  },
  {
    id: "gamma-world",
    name: "Gamma World",
    match: (full, name) => full.includes("gamma world") || name.includes("gamma world")
  },
  {
    id: "merp",
    name: "MERP",
    match: (full, name) => full.includes("merp") || name.includes("middle-earth")
  },
  {
    id: "call-of-cthulhu",
    name: "Call of Cthulhu",
    match: (full, name) => full.includes("call of cthulhu") || name.includes("cthulhu")
  },
  {
    id: "ars-magica",
    name: "Ars Magica",
    match: (full, name) => full.includes("ars magica") || name.includes("ars magica")
  },
  {
    id: "alternity",
    name: "Alternity",
    match: (full, name) => full.includes("alternity") || name.includes("alternity")
  },
  {
    id: "pendragon",
    name: "Pendragon",
    match: (full, name) => full.includes("pendragon") || name.includes("pendragon")
  },
  {
    id: "paranoia",
    name: "Paranoia",
    match: (full, name) => full.includes("paranoia") || name.includes("paranoia")
  },
  {
    id: "dcc",
    name: "Dungeon Crawl Classics",
    match: (full, name) => full.includes("dungeon crawl classics") || name.includes("dungeon crawl classics")
  },
  {
    id: "hackmaster",
    name: "Hackmaster",
    match: (full, name) => full.includes("hackmaster") || name.includes("hackmaster")
  },
  {
    id: "pathfinder",
    name: "Pathfinder",
    match: (full, name) => full.includes("pathfinder") || name.includes("pathfinder")
  }
];

const categoryOrder = [
  ["dungeon master", "gm"],
  ["game master", "gm"],
  ["player", "player"],
  ["monster manual", "monsters"],
  ["bestiary", "monsters"],
  ["monster", "monsters"],
  ["spellbook", "spells"],
  ["spells", "spells"],
  ["spell", "spells"],
  ["equipment", "equipment"],
  ["weapon", "equipment"],
  ["armory", "equipment"],
  ["gear", "equipment"],
  ["item", "equipment"],
  ["rulebook", "core"],
  ["rules", "core"],
  ["handbook", "core"],
  ["guide", "core"],
  ["core", "core"],
  ["srd", "core"],
  ["compendium", "reference"],
  ["codex", "reference"]
];

const normalize = (value) => value.toLowerCase();

const isManualCandidate = (name) => {
  const hasKeyword = manualPatterns.some((pattern) => pattern.test(name));
  const excluded = excludePatterns.some((pattern) => pattern.test(name));
  return hasKeyword && !excluded;
};

const categorize = (name) => {
  const lowered = normalize(name);
  for (const [needle, category] of categoryOrder) {
    if (lowered.includes(needle)) return category;
  }
  return "reference";
};

const detectSystem = (fullPath, name) => {
  const lowerFull = normalize(fullPath);
  const lowerName = normalize(name);
  for (const system of systemMatchers) {
    if (system.match(lowerFull, lowerName)) return { id: system.id, name: system.name };
  }
  return { id: "other", name: "Other" };
};

const walk = async (dir, entries = []) => {
  const dirEntries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of dirEntries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, entries);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      entries.push(full);
    }
  }
  return entries;
};

const main = async () => {
  const pdfs = await walk(root);
  const systems = new Map();

  for (const full of pdfs) {
    const filename = path.basename(full, ".pdf");
    const { id, name } = detectSystem(full, filename);
    const isCandidate =
      isManualCandidate(filename) ||
      (id === "gamma-world" && /edition|rules/i.test(filename));
    if (!isCandidate) continue;
    if (!systems.has(id)) {
      systems.set(id, { id, name, manuals: [] });
    }

    const relativePath = path.relative(root, full);
    systems.get(id).manuals.push({
      title: filename,
      path: relativePath,
      category: categorize(filename)
    });
  }

  const systemList = Array.from(systems.values()).map((system) => ({
    ...system,
    manuals: system.manuals.sort((a, b) => a.title.localeCompare(b.title))
  }));

  const payload = {
    root,
    generatedAt: new Date().toISOString(),
    systems: systemList.sort((a, b) => a.name.localeCompare(b.name))
  };

  const summary = {
    generatedAt: payload.generatedAt,
    systems: payload.systems.map((system) => {
      const categoryCounts = system.manuals.reduce((acc, manual) => {
        acc[manual.category] = (acc[manual.category] ?? 0) + 1;
        return acc;
      }, {});
      return {
        id: system.id,
        name: system.name,
        manualCount: system.manuals.length,
        categories: categoryCounts,
        sampleTitles: system.manuals.slice(0, 4).map((manual) => manual.title)
      };
    })
  };

  await fs.mkdir(path.dirname(fullOutput), { recursive: true });
  await fs.mkdir(path.dirname(summaryOutput), { recursive: true });
  await fs.writeFile(fullOutput, JSON.stringify(payload, null, 2));
  await fs.writeFile(summaryOutput, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${fullOutput} and ${summaryOutput} (${payload.systems.length} systems).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
