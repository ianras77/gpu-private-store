import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const dataRoot = path.join(webRoot, "data");
const defaultPdf = path.join(
  process.env.DM_LIBRARY_ROOT || "/media/roleplay",
  "Gamma World",
  "Gamma World 5th Edition.pdf"
);

const pdfPath = process.argv[2] || defaultPdf;
const outputPath = process.argv[3] || path.join(dataRoot, "gamma-world-5.json");

const cacheOcrPath = outputPath.replace(/\.json$/, ".ocr.txt");
const useOcrCache = process.env.DM_OCR_CACHE === "1";
const debugOcr = process.env.DM_OCR_DEBUG === "1";
const ocrDpi = Number.parseInt(process.env.DM_OCR_DPI ?? "220", 10);

const hasPdfToText = async () => {
  try {
    await execFileAsync("pdftotext", ["-v"]);
    return true;
  } catch {
    return false;
  }
};

const hasTesseract = async () => {
  try {
    await execFileAsync("tesseract", ["--version"]);
    return true;
  } catch {
    return false;
  }
};

const ocrPdf = async (sourcePath) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gamma-ocr-"));
  const prefix = path.join(tmpDir, "page");
  await execFileAsync("pdftoppm", ["-r", String(ocrDpi), "-png", sourcePath, prefix]);
  const files = (await fs.readdir(tmpDir))
    .filter((file) => file.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let combined = "";
  for (const file of files) {
    const input = path.join(tmpDir, file);
    const outputBase = path.join(tmpDir, path.basename(file, ".png"));
    await execFileAsync("tesseract", [input, outputBase, "-l", "eng"], {
      maxBuffer: 1024 * 1024 * 20
    });
    try {
      const pageText = await fs.readFile(`${outputBase}.txt`, "utf-8");
      combined += `${pageText}\n\n\f\n\n`;
    } catch {
      // skip unreadable pages
    }
  }

  return combined;
};

const normalize = (value) => value.replace(/\s+/g, " ").trim();

const normalizeParagraph = (lines) => {
  let combined = "";
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (combined.endsWith("-")) {
      combined = `${combined.slice(0, -1)}${trimmed}`;
    } else {
      combined = combined ? `${combined} ${trimmed}` : trimmed;
    }
  }
  return normalize(combined);
};

const isHeading = (line, prevBlank) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 4 || trimmed.length > 60) return false;
  const hasLetters = /[A-Za-z]/.test(trimmed);
  if (!hasLetters) return false;
  const upper = trimmed.toUpperCase();
  const isAllCaps = trimmed === upper;
  const isTitleCase = trimmed.split(" ").every((word) =>
    word.length <= 3 ? true : word[0] === word[0]?.toUpperCase()
  );
  return prevBlank && (isAllCaps || isTitleCase);
};

const mutationAbilityRegex = /\b(STR|DEX|CON|INT|WIL|PER)\b/i;
const mutationTypeRegex = /\b(Activated|Permanent|Automatic|Passive|Triggered)\b/i;

const featureCategoryRules = [
  { id: "mutations", match: /mutation/i },
  { id: "drawbacks", match: /drawback/i },
  { id: "skills", match: /skill/i },
  { id: "equipment", match: /equipment|gear/i },
  { id: "armor", match: /armor/i },
  { id: "weapons", match: /weapon/i },
  { id: "vehicles", match: /vehicle/i },
  { id: "artifacts", match: /artifact/i },
  { id: "combat", match: /combat|action check|initiative|attack/i },
  { id: "encounters", match: /encounter|adventure|scenario|scene/i },
  { id: "creatures", match: /creature|monster|npc|beast/i },
  { id: "races", match: /race|species/i },
  { id: "setting", match: /setting|gamma world|gamma terra|world|faction|land/i },
  { id: "rules", match: /rules|mechanic|dice|check/i }
];

const classifySection = (title) => {
  for (const rule of featureCategoryRules) {
    if (rule.match.test(title)) return rule.id;
  }
  return "misc";
};

const isMutationNameLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/Mutation Descriptions/i.test(trimmed)) return false;
  if (/^Table\\s*GW|^Tape\\s*GW|^TaBLe\\s*GW/i.test(trimmed)) return false;
  if (/^d\\d+\\b/i.test(trimmed)) return false;
  if (trimmed.length < 3 || trimmed.length > 48) return false;
  if (/[.:]$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const wordCaps = words.filter((word) => {
    const first = word[0];
    return first && first === first.toUpperCase();
  }).length;
  return wordCaps / words.length >= 0.6;
};

const isMutationRankLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (!mutationAbilityRegex.test(trimmed)) return false;
  if (!mutationTypeRegex.test(trimmed)) return false;
  if (!/,/.test(trimmed)) return false;
  if (trimmed.length > 90) return false;
  return true;
};

const parseMutationRankLine = (line) => {
  const parts = line.split(",").map((part) => part.trim());
  return {
    rank: parts[0] ?? "",
    activation: parts[1] ?? "",
    ability: parts[2] ?? ""
  };
};

const parseRankedEntry = (name, line, descriptionLines, section, kind) => {
  const { rank, activation, ability } = parseMutationRankLine(line);
  return {
    name,
    rank,
    activation,
    ability,
    description: normalizeParagraph(descriptionLines),
    section,
    kind
  };
};

const shouldSkipMutationLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^Table\\s*GW|^Tape\\s*GW|^TaBLe\\s*GW/i.test(trimmed)) return true;
  if (/^d20\\b/i.test(trimmed)) return true;
  if (/^\\d{1,2}\\s+[A-Za-z].{0,6}\\b/i.test(trimmed) && !/[.!?]/.test(trimmed)) return true;
  return false;
};

const extractMutationsFromLines = (lines, kind) => {
  const entries = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!isMutationNameLine(line)) {
      i += 1;
      continue;
    }

    let rankIndex = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j += 1) {
      if (isMutationRankLine(lines[j])) {
        rankIndex = j;
        break;
      }
    }

    if (rankIndex === -1) {
      i += 1;
      continue;
    }

    const descriptionLines = [];
    let k = rankIndex + 1;
    for (; k < lines.length; k += 1) {
      const nextLine = lines[k].trim();
      if (isMutationNameLine(nextLine)) {
        let nextRank = -1;
        for (let j = k + 1; j < Math.min(lines.length, k + 7); j += 1) {
          if (isMutationRankLine(lines[j])) {
            nextRank = j;
            break;
          }
        }
        if (nextRank !== -1) break;
      }
      if (!shouldSkipMutationLine(nextLine)) {
        descriptionLines.push(lines[k]);
      }
    }

    entries.push(
      parseRankedEntry(
        line,
        lines[rankIndex],
        descriptionLines,
        kind === "mental" ? "Mental Mutations" : "Physical Mutations",
        kind
      )
    );

    i = k;
  }

  return entries;
};

const extractDrawbacksFromLines = (lines) => {
  const entries = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!isMutationNameLine(line)) {
      i += 1;
      continue;
    }

    let rankIndex = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j += 1) {
      if (isMutationRankLine(lines[j])) {
        rankIndex = j;
        break;
      }
    }

    if (rankIndex === -1) {
      i += 1;
      continue;
    }

    const descriptionLines = [];
    let k = rankIndex + 1;
    for (; k < lines.length; k += 1) {
      const nextLine = lines[k].trim();
      if (isMutationNameLine(nextLine)) {
        let nextRank = -1;
        for (let j = k + 1; j < Math.min(lines.length, k + 7); j += 1) {
          if (isMutationRankLine(lines[j])) {
            nextRank = j;
            break;
          }
        }
        if (nextRank !== -1) break;
      }
      if (!shouldSkipMutationLine(nextLine)) {
        descriptionLines.push(lines[k]);
      }
    }

    entries.push(parseRankedEntry(line, lines[rankIndex], descriptionLines, "Drawbacks", "drawback"));
    i = k;
  }

  return entries;
};

const extractTableEntries = (lines) => {
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length > 180) continue;
    if (!/\\d/.test(trimmed)) continue;
    if (/^d\\d+\\b/i.test(trimmed) || /^\\d{1,2}\\s+/.test(trimmed)) {
      entries.push(trimmed);
      continue;
    }
    if (/^\\d+\\s*\\-\\s*\\d+/.test(trimmed)) {
      entries.push(trimmed);
      continue;
    }
    if (trimmed.length <= 120) {
      entries.push(trimmed);
    }
  }
  return entries;
};

const categorize = (title, text) => {
  if (/weapon|equipment|armory|melee|ranged/i.test(title)) return "weapons";
  if (/encounter|event|random encounter|adventure seed|story seed/i.test(title)) return "events";
  if (/creature|monster|npc|beast/i.test(title)) return "characters";
  if (/mutation/i.test(title)) return "mutations";
  if (/drawback/i.test(title)) return "drawbacks";
  if (/Description:/i.test(text) && /Habitat|Encounter|Action check/i.test(text)) return "characters";
  return null;
};

const extractWeaponEntriesFromLine = (line, section) => {
  const normalized = line
    .replace(/[—–]/g, "-")
    .replace(/UnarmedAttack/g, "Unarmed Attack")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];
  if (/Weapon Skill|Acc Md Range/i.test(normalized)) return [];
  if (!/\bMelee\b|\bRanged\b|\bUnarmed\b/i.test(normalized)) return [];

  const chunks = normalized.split(/(?=\b[GAS]\s+[A-Z])/).map((chunk) => chunk.trim());
  const entries = [];

  for (const chunk of chunks) {
    if (!/^[GAS]\s+/.test(chunk)) continue;
    const age = chunk.slice(0, 1);
    const rest = chunk.slice(2).trim();
    const typeMatch = rest.match(/\b(Melee|Ranged|Unarmed)\b/i);
    if (!typeMatch) continue;
    const name = rest.slice(0, typeMatch.index).trim().replace(/^[^A-Za-z]+/, "");
    if (!name) continue;
    const details = rest.slice(typeMatch.index).trim();
    entries.push({ age, name, details, section, raw: chunk });
  }

  return entries;
};

const extractWeaponEntriesFromRawLines = (lines) => {
  const entries = [];
  for (const line of lines) {
    const normalized = line
      .replace(/[—–]/g, "-")
      .replace(/UnarmedAttack/g, "Unarmed Attack")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) continue;
    if (!/^[GAS]\s+/i.test(normalized)) continue;
    if (!/\b(Melee|Ranged|Unarmed)\b/i.test(normalized)) continue;
    if (!/\bd\d+/i.test(normalized)) continue;
    entries.push(...extractWeaponEntriesFromLine(normalized, "GLOBAL SCAN"));
  }
  return entries;
};

const extractWeaponDescriptions = (text, section) => {
  const lines = text.split("\n");
  const entries = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Za-z'’\-\s]{2,40})\s*:\s*(.+)$/);
    if (match) {
      if (current) entries.push(current);
      const name = match[1].trim();
      if (/Description|Encounter|Habitat/i.test(name)) continue;
      current = { name, description: match[2].trim(), section };
      continue;
    }

    if (current && line.trim()) {
      current.description += ` ${line.trim()}`;
    }
  }

  if (current) entries.push(current);
  return entries;
};

const extractEventEntries = (lines, section) => {
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^d\d+$/i.test(trimmed)) continue;
    const numbered = trimmed.match(/^(\d+)\s+(.+)/);
    if (numbered) {
      entries.push({ text: `${numbered[1]} ${numbered[2]}`, section });
      continue;
    }
    if (/^\s*d\d+/i.test(trimmed) || /\b\(d\d+\)/i.test(trimmed)) {
      entries.push({ text: trimmed, section });
    }
  }
  return entries;
};

const extractCreatureEntries = (text, section) => {
  const cleanedSection = section.replace(/[‘’]/g, "").trim();
  const isGenericSection = /creatures|character|mutant|traits/i.test(cleanedSection);
  const isLikelyName =
    !isGenericSection && cleanedSection.split(" ").length <= 3 && cleanedSection.length <= 32;
  if (isLikelyName) {
    return [{ name: cleanedSection, text, section }];
  }

  const stopwords = new Set([
    "the",
    "a",
    "an",
    "both",
    "most",
    "this",
    "these",
    "those",
    "their",
    "they",
    "it",
    "its",
    "description",
    "standing",
    "encounter",
    "habitat",
    "action",
    "on",
    "in",
    "with",
    "and",
    "for",
    "their",
    "beast",
    "fish",
    "wings",
    "but",
    "claws",
    "teeth",
    "tail",
    "horns",
    "eyes",
    "creature",
    "animal"
  ]);
  const entries = [];
  const segments = text.split(/Description:\s*/i);
  if (segments.length === 1) return entries;

  for (const segment of segments.slice(1)) {
    let name = "Unknown";
    const verbMatch = segment.match(
      /\b([A-Za-z][A-Za-z'-]{2,})\s+(are|is|walk|stands|stand|prefer|tend|roam|sport|attack|live|hunt|feed|look|have|wear)\b/i
    );
    if (verbMatch && !stopwords.has(verbMatch[1].toLowerCase())) {
      name = verbMatch[1];
    } else {
      const words = segment.trim().split(/\s+/);
      for (const word of words) {
        const cleaned = word.replace(/[^A-Za-z'-]/g, "");
        if (!cleaned) continue;
        if (stopwords.has(cleaned.toLowerCase())) continue;
        name = cleaned;
        break;
      }
    }
    entries.push({ name, text: `Description: ${segment.trim()}`, section });
  }

  return entries;
};

const main = async () => {
  if (!(await hasPdfToText())) {
    console.error("pdftotext is not installed. Install poppler-utils to ingest manuals.");
    process.exit(1);
  }

  let rawText = "";
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"]);
  rawText = stdout;
  const meaningfulChars = rawText.replace(/[\f\s]/g, "").length;

  if (meaningfulChars < 1000) {
    if (useOcrCache) {
      try {
        rawText = await fs.readFile(cacheOcrPath, "utf-8");
      } catch {
        // ignore cache miss
      }
    }

    if (rawText.replace(/[\f\s]/g, "").length >= 1000) {
      console.log("Loaded OCR text from cache.");
    } else {
      if (!(await hasTesseract())) {
        console.error(
          "Gamma World 5 PDF appears to be scanned. Install tesseract-ocr to continue OCR ingestion."
        );
        process.exit(1);
      }
      console.log("Running OCR pass (this may take a while)...");
      rawText = await ocrPdf(pdfPath);
      if (useOcrCache || debugOcr) {
        await fs.writeFile(cacheOcrPath, rawText);
      }
    }
  }

  if (debugOcr) {
    await fs.writeFile(cacheOcrPath, rawText);
  }

  const lines = rawText.split("\n");
  const sections = [];

  let current = { title: "", lines: [] };
  let prevBlank = true;

  for (const line of lines) {
    if (isHeading(line, prevBlank)) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: normalize(line), lines: [] };
    } else {
      current.lines.push(line);
    }
    prevBlank = line.trim() === "";
  }
  if (current.title || current.lines.length) sections.push(current);

  const result = {
    generatedAt: new Date().toISOString(),
    source: {
      system: "Gamma World",
      edition: "5e",
      title: path.basename(pdfPath, ".pdf"),
      path: pdfPath
    },
    weapons: { sections: [], entries: [] },
    events: { sections: [], entries: [] },
    characters: { sections: [], entries: [] },
    mutations: { sections: [], entries: [] },
    powers: { sections: [], entries: [] },
    drawbacks: { sections: [], entries: [] },
    sections: [],
    features: {},
    tables: [],
    stats: {
      totalSections: sections.length,
      categorizedSections: 0
    }
  };

  for (const rule of featureCategoryRules) {
    result.features[rule.id] = [];
  }
  result.features.misc = [];

  for (const section of sections) {
    if (!section.title) continue;
    const text = normalize(section.lines.join("\n"));
    const featureCategory = classifySection(section.title);
    const sectionEntry = { title: section.title, text, category: featureCategory };
    result.sections.push(sectionEntry);
    result.features[featureCategory]?.push(sectionEntry);

    if (/table/i.test(section.title) && !/contents/i.test(section.title)) {
      const tableEntries = extractTableEntries(section.lines);
      if (tableEntries.length) {
        result.tables.push({
          title: section.title,
          entries: tableEntries,
          section: section.title
        });
      } else {
        const fallbackText = normalizeParagraph(section.lines);
        if (fallbackText) {
          result.tables.push({
            title: section.title,
            entries: [fallbackText],
            section: section.title
          });
        }
      }
    }

    const category = categorize(section.title, text);
    if (!category) continue;
    result.stats.categorizedSections += 1;

    result[category].sections.push({ title: section.title, text });

    if (category === "weapons") {
      for (const line of section.lines) {
        result.weapons.entries.push(...extractWeaponEntriesFromLine(line, section.title));
      }
      if (/weapon/i.test(section.title)) {
        result.weapons.entries.push(...extractWeaponDescriptions(text, section.title));
      }
    }

    if (category === "events") {
      result.events.entries.push(...extractEventEntries(section.lines, section.title));
    }

    if (category === "characters") {
      result.characters.entries.push(...extractCreatureEntries(text, section.title));
    }

    if (category === "mutations") {
      result.mutations.sections.push({ title: section.title, text });
    }

    if (category === "drawbacks") {
      result.drawbacks.sections.push({ title: section.title, text });
    }
  }

  if (result.weapons.entries.length < 10) {
    const globalWeapons = extractWeaponEntriesFromRawLines(lines);
    const existing = new Set(result.weapons.entries.map((entry) => `${entry.name}|${entry.details}`));
    for (const entry of globalWeapons) {
      const key = `${entry.name}|${entry.details}`;
      if (existing.has(key)) continue;
      existing.add(key);
      result.weapons.entries.push(entry);
    }
  }

  const physicalLines = (() => {
    const start = lines.findIndex((line) => /Physical Mutation Descriptions/i.test(line));
    if (start === -1) return [];
    const end = lines.findIndex(
      (line, index) => index > start && /Mental Mutation Descriptions/i.test(line)
    );
    return lines.slice(start + 1, end === -1 ? lines.length : end);
  })();

  const mentalLines = (() => {
    const start = lines.findIndex((line) => /Mental Mutation Descriptions/i.test(line));
    if (start === -1) return [];
    const end = lines.findIndex(
      (line, index) =>
        index > start && /Drawback Descriptions|Chapter\\s+8/i.test(line)
    );
    return lines.slice(start + 1, end === -1 ? lines.length : end);
  })();

  const physicalMutations = extractMutationsFromLines(physicalLines, "physical");
  const mentalMutations = extractMutationsFromLines(mentalLines, "mental");
  result.mutations.entries.push(...physicalMutations, ...mentalMutations);
  result.powers.entries.push(...mentalMutations);

  const drawbackLines = (() => {
    const start = lines.findIndex((line) => /^\s*Drawback Descriptions\s*$/i.test(line));
    if (start === -1) return [];
    const end = lines.findIndex(
      (line, index) => index > start && /^Chapter\s+\d+/i.test(line.trim())
    );
    return lines.slice(start + 1, end === -1 ? lines.length : end);
  })();

  const drawbackEntries = extractDrawbacksFromLines(drawbackLines);
  result.drawbacks.entries.push(...drawbackEntries);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

  console.log(
    `Wrote ${outputPath}. Weapons: ${result.weapons.entries.length}, Events: ${result.events.entries.length}, Characters: ${result.characters.entries.length}, Mutations: ${result.mutations.entries.length}, Powers: ${result.powers.entries.length}, Drawbacks: ${result.drawbacks.entries.length}, Sections: ${result.sections.length}, Tables: ${result.tables.length}.`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
