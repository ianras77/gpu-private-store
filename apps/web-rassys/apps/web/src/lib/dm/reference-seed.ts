import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { PoolClient } from "pg";

type GammaFile = {
  source?: Record<string, unknown>;
  generatedAt?: string;
  sections?: Array<Record<string, unknown>>;
  tables?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type DmLibrarySummaryFile = {
  generatedAt?: string;
  systems?: unknown;
};

type DmLibrarySummarySystem = {
  id: string;
  name: string;
  manualCount: number;
  categories: Record<string, number>;
  sampleTitles: string[];
};

type SeedCompendiumEntry = {
  sourceRef: string;
  entryType: string;
  name: string;
  slug: string;
  summary: string;
  rulesText: string;
  tags: string[];
  data: Record<string, unknown>;
};

let seedDone = false;

const gammaWorldDataPathCandidates = [
  path.resolve(process.cwd(), "apps/web/data/gamma-world-5.json"),
  path.resolve(process.cwd(), "data/gamma-world-5.json")
];

const dmLibrarySummaryPathCandidates = [
  path.resolve(process.cwd(), "apps/web/src/data/dm-library-summary.json"),
  path.resolve(process.cwd(), "src/data/dm-library-summary.json")
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 160);

const excerpt = (value: string, limit: number) => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const textFromUnknown = (value: unknown) => (typeof value === "string" ? value : "");

const recordFromUnknown = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toNumberMap = (value: unknown) =>
  Object.fromEntries(
    Object.entries(recordFromUnknown(value)).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  );

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const idFrom = (prefix: string, value: string) => {
  const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
};

export const shouldRefreshGammaCompendium = ({
  existingCount,
  expectedCount
}: {
  existingCount: number;
  expectedCount: number;
}) => expectedCount > existingCount;

const categoryToEntryType: Record<string, string> = {
  weapons: "weapon",
  events: "event",
  characters: "character",
  mutations: "mutation",
  powers: "power",
  drawbacks: "drawback",
  sections: "lore",
  tables: "table"
};

const nameFromEntry = (category: string, entry: Record<string, unknown>, index: number) => {
  const possible = [
    textFromUnknown(entry.name),
    textFromUnknown(entry.title),
    excerpt(textFromUnknown(entry.text), 90),
    excerpt(textFromUnknown(entry.raw), 90)
  ].find((value) => value.trim().length > 0);
  return possible ? possible.trim() : `${category}-${index + 1}`;
};

const summaryFromEntry = (entry: Record<string, unknown>) => {
  const candidates = [
    textFromUnknown(entry.description),
    textFromUnknown(entry.details),
    textFromUnknown(entry.text),
    textFromUnknown(entry.raw)
  ];
  const selected = candidates.find((value) => value.trim().length > 0) ?? "";
  return excerpt(selected, 420);
};

const rulesTextFromEntry = (entry: Record<string, unknown>) => {
  const pieces = [
    textFromUnknown(entry.text),
    textFromUnknown(entry.description),
    textFromUnknown(entry.details),
    textFromUnknown(entry.raw)
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return excerpt(pieces.join("\n\n"), 5000);
};

const tagsFromEntry = (category: string, entry: Record<string, unknown>) => {
  const sectionTag = textFromUnknown(entry.section).trim();
  const kindTag = textFromUnknown(entry.kind).trim();
  return [category, sectionTag, kindTag].filter((value) => value.length > 0);
};

const pushCatalogEntries = (
  items: SeedCompendiumEntry[],
  category: string,
  entries: Array<Record<string, unknown>>
) => {
  const entryType = categoryToEntryType[category] ?? "reference";
  entries.forEach((entry, index) => {
    const name = nameFromEntry(category, entry, index);
    const slugBase = slugify(name) || `${category}-${index + 1}`;
    items.push({
      sourceRef: `${category}:${index + 1}`,
      entryType,
      name,
      slug: `${slugBase}-${index + 1}`,
      summary: summaryFromEntry(entry),
      rulesText: rulesTextFromEntry(entry),
      tags: tagsFromEntry(category, entry),
      data: entry
    });
  });
};

const gammaTemplateEntries = (): SeedCompendiumEntry[] => {
  const templates: Array<{
    name: string;
    playerType: string;
    summary: string;
    attributes: Array<{ key: string; valueNumber?: number; valueText?: string; source?: string }>;
    actions: Array<{
      key: string;
      name: string;
      description: string;
      actionType: string;
      usesCurrent?: number;
      usesMax?: number;
      cooldownTurns?: number;
    }>;
    specialTraits: string[];
  }> = [
    {
      name: "Scout",
      playerType: "Striker",
      summary: "Fast recon specialist who controls encounter tempo.",
      attributes: [
        { key: "awareness", valueNumber: 12, source: "template" },
        { key: "agility", valueNumber: 13, source: "template" },
        { key: "tech", valueNumber: 9, source: "template" }
      ],
      actions: [
        {
          key: "quick_scan",
          name: "Quick Scan",
          description: "Reveal immediate threats and likely routes.",
          actionType: "utility",
          usesCurrent: 2,
          usesMax: 2,
          cooldownTurns: 0
        },
        {
          key: "shadow_step",
          name: "Shadow Step",
          description: "Reposition with reduced exposure to reaction fire.",
          actionType: "combat",
          usesCurrent: 1,
          usesMax: 1,
          cooldownTurns: 2
        }
      ],
      specialTraits: ["Pathfinder", "Low-Light Vision"]
    },
    {
      name: "Mutant Adept",
      playerType: "Controller",
      summary: "Mutation-focused specialist that bends battlefield conditions.",
      attributes: [
        { key: "willpower", valueNumber: 13, source: "template" },
        { key: "mutation_control", valueNumber: 12, source: "template" },
        { key: "endurance", valueNumber: 8, source: "template" }
      ],
      actions: [
        {
          key: "psi_pulse",
          name: "Psi Pulse",
          description: "Project focused psychic disruption.",
          actionType: "special",
          usesCurrent: 2,
          usesMax: 2
        },
        {
          key: "rad_shift",
          name: "Rad Shift",
          description: "Convert local radiation into a temporary advantage.",
          actionType: "utility",
          usesCurrent: 1,
          usesMax: 1,
          cooldownTurns: 3
        }
      ],
      specialTraits: ["Mutation Affinity", "Psychic Echo"]
    },
    {
      name: "Scrapper",
      playerType: "Support",
      summary: "Improvises gear, keeps equipment online, and stabilizes teams.",
      attributes: [
        { key: "engineering", valueNumber: 13, source: "template" },
        { key: "salvage", valueNumber: 12, source: "template" },
        { key: "grit", valueNumber: 10, source: "template" }
      ],
      actions: [
        {
          key: "jury_rig",
          name: "Jury Rig",
          description: "Temporarily repair broken gear or environmental machinery.",
          actionType: "utility",
          usesCurrent: 2,
          usesMax: 2
        },
        {
          key: "field_patch",
          name: "Field Patch",
          description: "Restore a small amount of HP to an ally.",
          actionType: "support",
          usesCurrent: 2,
          usesMax: 2
        }
      ],
      specialTraits: ["Improviser", "Salvage Sense"]
    },
    {
      name: "Beast Rider",
      playerType: "Vanguard",
      summary: "Mounted shock specialist with rapid entry and disengage options.",
      attributes: [
        { key: "presence", valueNumber: 11, source: "template" },
        { key: "athletics", valueNumber: 12, source: "template" },
        { key: "bond", valueNumber: 13, source: "template" }
      ],
      actions: [
        {
          key: "charge_line",
          name: "Charge Line",
          description: "Break hostile formations with mounted momentum.",
          actionType: "combat",
          usesCurrent: 1,
          usesMax: 1,
          cooldownTurns: 2
        },
        {
          key: "beast_guard",
          name: "Beast Guard",
          description: "Companion intercepts one incoming strike.",
          actionType: "defense",
          usesCurrent: 1,
          usesMax: 1,
          cooldownTurns: 2
        }
      ],
      specialTraits: ["Companion Link", "Mounted Mobility"]
    }
  ];

  return templates.map((template, index) => ({
    sourceRef: `template:archetype:${slugify(template.name) || index + 1}`,
    entryType: "archetype_template",
    name: template.name,
    slug: `template-${slugify(template.name) || index + 1}`,
    summary: template.summary,
    rulesText: template.summary,
    tags: ["template", "archetype", "character_creation"],
    data: template as Record<string, unknown>
  }));
};

const loadGammaWorldData = async (): Promise<GammaFile | null> => {
  for (const filePath of gammaWorldDataPathCandidates) {
    try {
      await fs.access(filePath);
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as GammaFile;
    } catch {
      // Try the next candidate path.
    }
  }
  return null;
};

const loadDmLibrarySummary = async (): Promise<DmLibrarySummaryFile | null> => {
  for (const filePath of dmLibrarySummaryPathCandidates) {
    try {
      await fs.access(filePath);
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as DmLibrarySummaryFile;
    } catch {
      // Try the next candidate path.
    }
  }
  return null;
};

const parseDmLibrarySystems = (data: DmLibrarySummaryFile | null): DmLibrarySummarySystem[] => {
  if (!data || !Array.isArray(data.systems)) return [];

  return data.systems
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      id: textFromUnknown(entry.id).trim(),
      name: textFromUnknown(entry.name).trim(),
      manualCount:
        typeof entry.manualCount === "number" && Number.isFinite(entry.manualCount)
          ? Math.max(0, Math.round(entry.manualCount))
          : 0,
      categories: toNumberMap(entry.categories),
      sampleTitles: toStringArray(entry.sampleTitles).slice(0, 6)
    }))
    .filter((entry) => entry.id.length > 0 && entry.name.length > 0);
};

const buildSystemDescription = (displayName: string, manualCount: number) =>
  manualCount > 0
    ? `${displayName} with ${manualCount} indexed manual${manualCount === 1 ? "" : "s"} available for world-building and compendium search.`
    : `${displayName} ready for narrative campaign play.`;

const buildSystemRulesPrimer = (displayName: string) =>
  `${displayName}: keep world state coherent, apply consequences consistently, and ground responses in the selected ruleset when indexed references exist.`;

const buildGammaCompendiumRows = (data: GammaFile): SeedCompendiumEntry[] => {
  const rows: SeedCompendiumEntry[] = [];
  const topLevelCategories = ["weapons", "events", "characters", "mutations", "powers", "drawbacks"] as const;

  for (const category of topLevelCategories) {
    const bucket = data[category];
    const entries =
      bucket && typeof bucket === "object" && Array.isArray((bucket as { entries?: unknown }).entries)
        ? ((bucket as { entries: unknown[] }).entries.filter(
            (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
          ) as Array<Record<string, unknown>>)
        : [];
    pushCatalogEntries(rows, category, entries);
  }

  const sectionEntries = Array.isArray(data.sections)
    ? data.sections.filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
      )
    : [];
  pushCatalogEntries(rows, "sections", sectionEntries);

  const tableEntries = Array.isArray(data.tables)
    ? data.tables.filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
      )
    : [];
  pushCatalogEntries(rows, "tables", tableEntries);

  rows.push(...gammaTemplateEntries());
  return rows;
};

export const seedDmReferenceData = async (client: PoolClient) => {
  if (seedDone) return;

  await client.query(
    `INSERT INTO dm_systems (id, display_name, description, rules_primer, created_at, updated_at)
     VALUES (
       'generic',
       'Generic RPG',
       'System-agnostic fallback for narrative RPG sessions.',
       'Maintain continuity, bounded state changes, and explicit consequences.',
       now(),
       now()
     )
     ON CONFLICT (id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       description = EXCLUDED.description,
       rules_primer = EXCLUDED.rules_primer,
       updated_at = now()`
  );

  await client.query(
    `INSERT INTO dm_systems (id, display_name, description, rules_primer, created_at, updated_at)
     VALUES (
       'gamma-world',
       'Gamma World',
       'Post-apocalyptic science-fantasy with mutations, salvage tech, and faction conflict.',
       'Gamma World emphasizes consequences, unstable technology, and evolving world state.',
       now(),
       now()
     )
     ON CONFLICT (id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       description = EXCLUDED.description,
       rules_primer = EXCLUDED.rules_primer,
       updated_at = now()`
  );

  const dmLibrarySystems = parseDmLibrarySystems(await loadDmLibrarySummary());
  for (const system of dmLibrarySystems) {
    await client.query(
      `INSERT INTO dm_systems (id, display_name, description, rules_primer, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now(), now())
       ON CONFLICT (id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = CASE
           WHEN btrim(dm_systems.description) = '' THEN EXCLUDED.description
           ELSE dm_systems.description
         END,
         rules_primer = CASE
           WHEN btrim(dm_systems.rules_primer) = '' THEN EXCLUDED.rules_primer
           ELSE dm_systems.rules_primer
         END,
         metadata = COALESCE(dm_systems.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_at = now()`,
      [
        system.id,
        system.name,
        buildSystemDescription(system.name, system.manualCount),
        buildSystemRulesPrimer(system.name),
        JSON.stringify({
          manualCount: system.manualCount,
          categories: system.categories,
          sampleTitles: system.sampleTitles,
          source: "dm-library-summary"
        })
      ]
    );
  }

  await client.query(
    `INSERT INTO dm_compendium_sources (
       id,
       system_id,
       title,
       source_type,
       source_uri,
       version_label,
       metadata,
       created_at,
       updated_at
     )
     VALUES (
       'source_gamma_world_5e_manual',
       'gamma-world',
       'Gamma World Extracted Manual Data',
       'json_extract',
       'apps/web/data/gamma-world-5.json',
       'local-1',
       '{}'::jsonb,
       now(),
       now()
     )
     ON CONFLICT (id)
     DO UPDATE SET
       title = EXCLUDED.title,
       source_uri = EXCLUDED.source_uri,
       version_label = EXCLUDED.version_label,
       updated_at = now()`
  );

  const parsed = await loadGammaWorldData();
  const rows = parsed ? buildGammaCompendiumRows(parsed) : gammaTemplateEntries();
  const existing = await client.query<{ count: number }>(
    `SELECT count(*)::int as count
     FROM dm_compendium_entries
     WHERE system_id = 'gamma-world'`
  );
  const existingCount = Number(existing.rows[0]?.count ?? 0);

  if (!shouldRefreshGammaCompendium({ existingCount, expectedCount: rows.length })) {
    seedDone = true;
    return;
  }

  for (const row of rows) {
    const rowId = idFrom("entry", `gamma-world:${row.sourceRef}`);
    await client.query(
      `INSERT INTO dm_compendium_entries (
         id,
         system_id,
         source_id,
         source_ref,
         entry_type,
         name,
         slug,
         summary,
         rules_text,
         tags,
         data,
         created_at,
         updated_at
       )
       VALUES (
         $1, 'gamma-world', 'source_gamma_world_5e_manual',
         $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, now(), now()
       )
       ON CONFLICT (system_id, source_ref)
       DO UPDATE SET
         entry_type = EXCLUDED.entry_type,
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         summary = EXCLUDED.summary,
         rules_text = EXCLUDED.rules_text,
         tags = EXCLUDED.tags,
         data = EXCLUDED.data,
         updated_at = now()`,
      [
        rowId,
        row.sourceRef,
        row.entryType,
        row.name,
        row.slug,
        row.summary,
        row.rulesText,
        JSON.stringify(row.tags),
        JSON.stringify(row.data)
      ]
    );
  }

  seedDone = true;
};
