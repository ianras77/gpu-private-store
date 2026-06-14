import "server-only";

import { getCatProfileConfig } from "@/lib/cat/topology";
import { prisma } from "@/lib/db";
import {
  CURATED_ASSET_PACKS,
  getAssetPacksBySlugs,
  listApprovedCodePackagesForPacks,
  listAssetItemsForPacks,
  type ApprovedAssetItem,
  type ApprovedAssetPack,
  type ApprovedCodePackage
} from "@/lib/studio/assets";
import type {
  StudioAssetItemSummary,
  StudioAssetPackSummary,
  StudioBuildPlanSummary,
  StudioCodePackageSummary,
  StudioMapPatternSummary,
  StudioProjectSummary,
  StudioPublishTargetSummary,
  StudioTemplateSummary,
  StudioWorldProfileSummary,
  StudioWorldRecipeSummary,
  StudioWriterStageSummary
} from "@/lib/studio/types";
import { ROBLOX_WRITER_STAGES } from "@/lib/studio/writer-team";
import { buildGameSections } from "@/lib/studio/game-sections";
import {
  buildWorldRecipe,
  getMapPatternBySlug,
  getWorldProfileBySlug,
  recommendedMapPatternSlugs,
  recommendedWorldProfileSlugs,
  sanitizeMapPatternSlug,
  sanitizeWorldProfileSlug
} from "@/lib/studio/worlds";

type TemplateSeed = {
  slug: string;
  name: string;
  genre: string;
  ageBand: string;
  difficulty: string;
  summary: string;
  starterPrompt: string;
  defaultTheme: string;
  starterScenes: string[];
  primaryMechanics: string[];
  starterQuestText: string;
  artDirection: string;
  defaultOneLiner: string;
  defaultCoreLoop: string;
  starterNpcs: string[];
  starterScripts: string[];
};

type StudioProjectPatch = {
  title?: string;
  theme?: string;
  heroGoal?: string | null;
  templatePackSlug?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  selectedAssetPackSlugs?: string[];
  targetAudience?: string;
};

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    slug: "obby-rush",
    name: "Obby Rush",
    genre: "Obstacle course",
    ageBand: "7-10",
    difficulty: "Beginner",
    summary: "Bright checkpoint-based platforming with rewards and clear goals.",
    starterPrompt:
      "Help me build a colorful Roblox obby with checkpoints, coins, bright floating islands, and a funny guide character.",
    defaultTheme: "Sky islands and toy-box color",
    starterScenes: ["Spawn plaza", "Checkpoint canyon", "Moving platform lane", "Winner podium"],
    primaryMechanics: ["Checkpoints", "Collectible coins", "Moving platforms"],
    starterQuestText: "Reach the finish podium and collect at least 20 coins on the way.",
    artDirection: "Bright floating islands, chunky props, and celebratory finish effects.",
    defaultOneLiner:
      "Race across floating islands, hit checkpoints, and reach the winner podium in a Roblox obby.",
    defaultCoreLoop:
      "Jump past hazards, hit checkpoints, collect coins, and retry quickly after mistakes.",
    starterNpcs: ["Coach Comet", "Checkpoint Bot"],
    starterScripts: ["Checkpoint tracker", "Coin pickup", "Finish gate celebration"]
  },
  {
    slug: "pet-quest",
    name: "Pet Quest",
    genre: "Adventure",
    ageBand: "8-12",
    difficulty: "Beginner+",
    summary: "A friendly quest game where players help pets, explore zones, and earn upgrades.",
    starterPrompt:
      "Help me build a Roblox pet adventure where players meet cute creatures, finish quests, and unlock new zones.",
    defaultTheme: "Cozy village with magical critters",
    starterScenes: ["Pet village", "Forest path", "Rescue cave", "Celebration garden"],
    primaryMechanics: ["Talk to NPCs", "Quest tracking", "Unlockable zones"],
    starterQuestText: "Help three pets recover their lost items and unlock the celebration garden.",
    artDirection: "Warm colors, rounded houses, lanterns, and soft magical particles.",
    defaultOneLiner:
      "Meet magical pets, complete quests, and unlock the next part of the Roblox village.",
    defaultCoreLoop:
      "Talk to pets, collect quest items, return for rewards, and unlock a new area.",
    starterNpcs: ["Mochi the fox", "Mayor Pebble"],
    starterScripts: ["Quest journal", "Zone unlock gate", "Reward chest"]
  },
  {
    slug: "speed-sprint",
    name: "Speed Sprint",
    genre: "Racing",
    ageBand: "8-12",
    difficulty: "Beginner",
    summary: "Simple arcade racing with boosts, laps, and leaderboard-friendly goals.",
    starterPrompt:
      "Help me build a Roblox racing game with boost pads, laps, announcer messages, and a clear finish loop.",
    defaultTheme: "Neon training track",
    starterScenes: ["Garage start", "Boost straightaway", "Curve tunnel", "Finish circle"],
    primaryMechanics: ["Lap counting", "Boost pads", "Race timer"],
    starterQuestText: "Finish three laps and beat the target time to unlock the pro track.",
    artDirection: "High-contrast track lights, speed streaks, and arcade signage.",
    defaultOneLiner: "Blast through neon Roblox tracks, hit boost pads, and beat the target time.",
    defaultCoreLoop: "Race a lap, improve your line, hit boosts, and try to beat your last time.",
    starterNpcs: ["Turbo Tami", "Pit Crew Pip"],
    starterScripts: ["Lap counter", "Boost pad trigger", "Race timer HUD"]
  },
  {
    slug: "story-quest",
    name: "Story Quest",
    genre: "Narrative adventure",
    ageBand: "9-13",
    difficulty: "Beginner+",
    summary: "Scene-based questing with dialogue, choices, and a clear guided objective.",
    starterPrompt:
      "Help me build a Roblox story quest game with scenes, dialogue, clues, and a final reveal.",
    defaultTheme: "Mystery camp in the woods",
    starterScenes: ["Camp gate", "Clue trail", "Cabin puzzle", "Reveal stage"],
    primaryMechanics: ["Dialogue prompts", "Clue collection", "Scene progression"],
    starterQuestText:
      "Find the missing camp map by talking to characters and following the clue trail.",
    artDirection:
      "Storybook woods, lantern light, props with strong silhouettes, and cozy mystery mood.",
    defaultOneLiner: "Explore a mystery camp, collect clues, and uncover the final reveal.",
    defaultCoreLoop:
      "Talk to characters, collect clues, unlock the next scene, and solve the mystery.",
    starterNpcs: ["Ranger Rue", "Scout Nova"],
    starterScripts: ["Dialogue trigger", "Clue tracker", "Scene unlock controller"]
  }
];

function parseJsonArray(raw?: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function trimOrNull(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function trimText(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

function sanitizeAssetPackSlugs(slugs?: string[] | null) {
  const allowed = new Set(CURATED_ASSET_PACKS.map((pack) => pack.slug));
  return Array.from(new Set(slugs ?? [])).filter((slug) => allowed.has(slug));
}

function defaultSeed() {
  return TEMPLATE_SEEDS[0];
}

function findTemplateSeed(slug?: string | null) {
  return TEMPLATE_SEEDS.find((template) => template.slug === slug) ?? defaultSeed();
}

function defaultHeroGoal(template: TemplateSeed) {
  if (template.slug === "obby-rush") return "Reach the golden flag";
  if (template.slug === "pet-quest") return "Rescue the missing pet";
  if (template.slug === "speed-sprint") return "Win the race";
  return "Find the magic key";
}

function recommendedAssetPackSlugs(templateSlug: string) {
  return CURATED_ASSET_PACKS.filter((pack) => pack.recommendedTemplateSlugs.includes(templateSlug))
    .map((pack) => pack.slug)
    .slice(0, 2);
}

function toTemplateSummary(
  template:
    | TemplateSeed
    | {
        slug: string;
        name: string;
        genre: string;
        ageBand: string;
        difficulty: string;
        summary: string;
        starterPrompt: string;
        defaultTheme: string;
        starterScenesJson?: string | null;
        primaryMechanicsJson?: string | null;
        starterQuestText?: string | null;
        artDirection?: string | null;
      }
): StudioTemplateSummary {
  return {
    slug: template.slug,
    name: template.name,
    genre: template.genre,
    ageBand: template.ageBand,
    difficulty: template.difficulty,
    summary: template.summary,
    starterPrompt: template.starterPrompt,
    defaultTheme: template.defaultTheme,
    starterScenes:
      "starterScenes" in template
        ? template.starterScenes
        : parseJsonArray(template.starterScenesJson),
    primaryMechanics:
      "primaryMechanics" in template
        ? template.primaryMechanics
        : parseJsonArray(template.primaryMechanicsJson),
    starterQuestText: template.starterQuestText ?? null,
    artDirection: template.artDirection ?? null
  };
}

function slugForWorkspace(workspaceId: string) {
  return `launchpad-workspace-${workspaceId.slice(-6)}`;
}

function buildNextActions(project: {
  templatePackSlug?: string | null;
  theme?: string | null;
  heroGoal?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  selectedAssetPackSlugsJson?: string | null;
  connectionStatus: string;
  publishReadiness: string;
  parentModeEnabled: boolean;
  robloxUsername?: string | null;
  universeId?: string | null;
  placeId?: string | null;
}) {
  const actions: string[] = [];
  const selectedAssets = parseJsonArray(project.selectedAssetPackSlugsJson);

  if (!project.templatePackSlug) {
    actions.push("Pick a starter template so the project has a clear Roblox shape.");
  }

  if (!project.theme) {
    actions.push("Choose a strong theme to keep the world art direction consistent.");
  }

  if (!project.heroGoal) {
    actions.push("Choose one hero goal so the game loop stays simple and easy to build.");
  }

  if (!project.worldProfileSlug || !project.mapPatternSlug) {
    actions.push(
      "Lock a world profile and map pattern so the terrain crew can build visible progress fast."
    );
  }

  if (!selectedAssets.length) {
    actions.push("Pick one or two approved asset shelves before the next Roblox build pass.");
  }

  if (project.connectionStatus === "Guest") {
    actions.push(
      "Keep building in shared guest mode until the team wants a Roblox Studio handoff."
    );
  }

  if (!project.robloxUsername) {
    actions.push("Stay focused on the shared build first. Creator linking can come later.");
  }

  if (!project.universeId || !project.placeId) {
    actions.push("Hold off on place selection until the shared project feels fun in playtests.");
  }

  if (project.parentModeEnabled) {
    actions.push("Keep publish review gated, but continue building the shared Roblox starter now.");
  }

  if (project.publishReadiness !== "Studio-ready") {
    actions.push(
      "Use the coach to expand scenes, Luau tasks, NPCs, and build kits before publish."
    );
  }

  return actions.slice(0, 4);
}

function derivePublishReadiness(project: {
  templatePackSlug?: string | null;
  heroGoal?: string | null;
  selectedAssetPackSlugs: string[];
}) {
  if (!project.templatePackSlug || !project.heroGoal) {
    return "Planning";
  }

  if (!project.selectedAssetPackSlugs.length) {
    return "Starter ready";
  }

  return "Studio-ready";
}

function buildStarterBuildPlanData(options: {
  template: TemplateSeed;
  title: string;
  theme: string;
  heroGoal?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  selectedAssetPackSlugs: string[];
}) {
  const {
    template,
    title,
    theme,
    heroGoal,
    worldProfileSlug,
    mapPatternSlug,
    selectedAssetPackSlugs
  } = options;
  const questText = heroGoal ?? template.starterQuestText;
  const selectedAssetItems = listAssetItemsForPacks(selectedAssetPackSlugs);
  const approvedCodePackages = listApprovedCodePackagesForPacks(selectedAssetPackSlugs);
  const worldRecipe = buildWorldRecipe({
    templateSlug: template.slug,
    worldProfileSlug,
    mapPatternSlug,
    theme,
    heroGoal,
    selectedAssetPackSlugs
  });
  const scenes = worldRecipe.zoneSequence.length
    ? worldRecipe.zoneSequence
    : template.starterScenes;
  const mechanics = Array.from(
    new Set([...template.primaryMechanics, ...worldRecipe.mapPattern.traversalBeats.slice(0, 2)])
  ).slice(0, 6);

  return {
    status: "Drafting",
    oneLiner: `${title}: ${template.defaultOneLiner}`,
    coreLoop: template.defaultCoreLoop,
    scenesJson: JSON.stringify(scenes),
    mechanicsJson: JSON.stringify(mechanics),
    questsJson: JSON.stringify(questText ? [questText] : []),
    npcsJson: JSON.stringify(template.starterNpcs),
    scriptsJson: JSON.stringify(template.starterScripts),
    artDirectionJson: JSON.stringify({
      look: template.artDirection,
      theme,
      worldProfileSlug: worldRecipe.worldProfile.slug,
      worldProfileTitle: worldRecipe.worldProfile.title,
      mapPatternSlug: worldRecipe.mapPattern.slug,
      mapPatternTitle: worldRecipe.mapPattern.title,
      worldRecipeHeadline: worldRecipe.headline,
      worldRecipeLines: worldRecipe.promptLines,
      worldCrewLines: worldRecipe.crewLines,
      approvedAssetShelves: selectedAssetPackSlugs,
      approvedWorldPackSlugs: worldRecipe.recommendedAssetPackSlugs,
      approvedLocalBundleKeys: selectedAssetItems.map((item) => item.localBundleKey),
      approvedCodePackages: approvedCodePackages.map((pkg) => pkg.slug)
    })
  };
}

export async function seedTemplatePacks() {
  for (const template of TEMPLATE_SEEDS) {
    await prisma.templatePack.upsert({
      where: { slug: template.slug },
      update: {
        name: template.name,
        genre: template.genre,
        ageBand: template.ageBand,
        difficulty: template.difficulty,
        summary: template.summary,
        starterPrompt: template.starterPrompt,
        defaultTheme: template.defaultTheme,
        starterScenesJson: JSON.stringify(template.starterScenes),
        primaryMechanicsJson: JSON.stringify(template.primaryMechanics),
        starterQuestText: template.starterQuestText,
        artDirection: template.artDirection
      },
      create: {
        slug: template.slug,
        name: template.name,
        genre: template.genre,
        ageBand: template.ageBand,
        difficulty: template.difficulty,
        summary: template.summary,
        starterPrompt: template.starterPrompt,
        defaultTheme: template.defaultTheme,
        starterScenesJson: JSON.stringify(template.starterScenes),
        primaryMechanicsJson: JSON.stringify(template.primaryMechanics),
        starterQuestText: template.starterQuestText,
        artDirection: template.artDirection
      }
    });
  }
}

async function findStudioProjectByWorkspace(workspaceId: string) {
  return prisma.studioProject.findFirst({
    where: { workspaceId },
    include: {
      templatePack: true
    },
    orderBy: { updatedAt: "desc" }
  });
}

async function adoptLegacyMemberProject(workspaceId: string, actorUserId: string) {
  const project = await prisma.studioProject.findFirst({
    where: {
      workspaceId: null,
      user: {
        workspaceMembers: {
          some: { workspaceId }
        }
      }
    },
    include: {
      templatePack: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!project) return null;

  return prisma.studioProject.update({
    where: { id: project.id },
    data: {
      workspaceId,
      lastEditedByUserId: actorUserId
    },
    include: {
      templatePack: true
    }
  });
}

async function ensureStudioScaffold(project: {
  id: string;
  title: string;
  theme: string;
  heroGoal?: string | null;
  templatePackSlug?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  selectedAssetPackSlugsJson?: string | null;
}) {
  const template = findTemplateSeed(project.templatePackSlug);
  const selectedAssetPackSlugs = sanitizeAssetPackSlugs(
    parseJsonArray(project.selectedAssetPackSlugsJson)
  );

  const [buildPlan, publishTarget] = await Promise.all([
    prisma.buildPlan.findFirst({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.publishTarget.findFirst({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  if (!buildPlan) {
    await prisma.buildPlan.create({
      data: {
        projectId: project.id,
        ...buildStarterBuildPlanData({
          template,
          title: project.title,
          theme: project.theme,
          heroGoal: project.heroGoal,
          worldProfileSlug: project.worldProfileSlug,
          mapPatternSlug: project.mapPatternSlug,
          selectedAssetPackSlugs
        })
      }
    });
  }

  if (!publishTarget) {
    await prisma.publishTarget.create({
      data: {
        projectId: project.id,
        authMode: "Shared studio",
        ownerType: "Workspace",
        creatorLabel: "Collaborative Launchpad project awaiting Roblox Studio handoff.",
        reviewStatus: "Build first",
        notesJson: JSON.stringify({
          checklist: [
            "Finalize starter template",
            "Review Luau tasks",
            "Choose approved asset shelves",
            "Run team playtest"
          ]
        })
      }
    });
  }
}

async function loadStudioProjectRecord(projectId: string) {
  return prisma.studioProject.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      templatePack: true,
      buildPlans: {
        orderBy: { updatedAt: "desc" },
        take: 1
      },
      publishTargets: {
        orderBy: { updatedAt: "desc" },
        take: 1
      }
    }
  });
}

export async function getOrCreateStudioProject(workspaceId: string, actorUserId: string) {
  await seedTemplatePacks();

  let project = await findStudioProjectByWorkspace(workspaceId);
  if (!project) {
    project = await adoptLegacyMemberProject(workspaceId, actorUserId);
  }

  if (!project) {
    const template = defaultSeed();
    const worldProfileSlug = recommendedWorldProfileSlugs(template.slug)[0] ?? null;
    const mapPatternSlug =
      recommendedMapPatternSlugs({
        templateSlug: template.slug,
        worldProfileSlug
      })[0] ?? null;
    project = await prisma.studioProject.create({
      data: {
        userId: actorUserId,
        workspaceId,
        slug: slugForWorkspace(workspaceId),
        title: "Sky Hopper Adventure",
        theme: template.defaultTheme,
        heroGoal: defaultHeroGoal(template),
        templatePackSlug: template.slug,
        worldProfileSlug,
        mapPatternSlug,
        selectedAssetPackSlugsJson: JSON.stringify(recommendedAssetPackSlugs(template.slug)),
        targetAudience: "Kids 7-12",
        connectionStatus: "Guest",
        publishReadiness: "Starter ready",
        parentModeEnabled: true,
        lastEditedByUserId: actorUserId
      },
      include: {
        templatePack: true
      }
    });
  }

  const resolvedTemplateSlug = project.templatePack?.slug ?? defaultSeed().slug;
  const normalizedWorldProfileSlug =
    sanitizeWorldProfileSlug(project.worldProfileSlug) ??
    recommendedWorldProfileSlugs(resolvedTemplateSlug)[0] ??
    null;
  const normalizedMapPatternSlug =
    sanitizeMapPatternSlug(project.mapPatternSlug) ??
    recommendedMapPatternSlugs({
      templateSlug: resolvedTemplateSlug,
      worldProfileSlug: normalizedWorldProfileSlug
    })[0] ??
    null;

  if (
    project.worldProfileSlug !== normalizedWorldProfileSlug ||
    project.mapPatternSlug !== normalizedMapPatternSlug
  ) {
    project = await prisma.studioProject.update({
      where: { id: project.id },
      data: {
        worldProfileSlug: normalizedWorldProfileSlug,
        mapPatternSlug: normalizedMapPatternSlug
      },
      include: {
        templatePack: true
      }
    });
  }

  await ensureStudioScaffold(project);
  return loadStudioProjectRecord(project.id);
}

async function upsertStarterBuildPlan(options: {
  projectId: string;
  template: TemplateSeed;
  title: string;
  theme: string;
  heroGoal?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  selectedAssetPackSlugs: string[];
}) {
  const existing = await prisma.buildPlan.findFirst({
    where: { projectId: options.projectId },
    orderBy: { updatedAt: "desc" }
  });

  const data = buildStarterBuildPlanData(options);

  if (!existing) {
    await prisma.buildPlan.create({
      data: {
        projectId: options.projectId,
        ...data
      }
    });
    return;
  }

  await prisma.buildPlan.update({
    where: { id: existing.id },
    data: {
      ...data,
      status: existing.status
    }
  });
}

export async function updateStudioProject(options: {
  workspaceId: string;
  actorUserId: string;
  patch: StudioProjectPatch;
}) {
  const project = await getOrCreateStudioProject(options.workspaceId, options.actorUserId);
  const selectedTemplate = findTemplateSeed(
    trimOrNull(options.patch.templatePackSlug) ?? project.templatePack?.slug ?? defaultSeed().slug
  );
  const selectedAssetPackSlugs = sanitizeAssetPackSlugs(
    options.patch.selectedAssetPackSlugs ?? parseJsonArray(project.selectedAssetPackSlugsJson)
  );
  const normalizedGoal =
    options.patch.heroGoal === undefined
      ? (project.heroGoal ?? defaultHeroGoal(selectedTemplate))
      : trimOrNull(options.patch.heroGoal);
  const theme = trimOrNull(options.patch.theme) ?? project.theme ?? selectedTemplate.defaultTheme;
  const title = trimOrNull(options.patch.title) ?? project.title;
  const targetAudience = trimOrNull(options.patch.targetAudience) ?? project.targetAudience;
  const worldProfileSlug =
    sanitizeWorldProfileSlug(options.patch.worldProfileSlug) ??
    sanitizeWorldProfileSlug(project.worldProfileSlug) ??
    recommendedWorldProfileSlugs(selectedTemplate.slug)[0] ??
    null;
  const mapPatternSlug =
    sanitizeMapPatternSlug(options.patch.mapPatternSlug) ??
    sanitizeMapPatternSlug(project.mapPatternSlug) ??
    recommendedMapPatternSlugs({
      templateSlug: selectedTemplate.slug,
      worldProfileSlug
    })[0] ??
    null;
  const publishReadiness = derivePublishReadiness({
    templatePackSlug: selectedTemplate.slug,
    heroGoal: normalizedGoal,
    selectedAssetPackSlugs
  });

  await prisma.studioProject.update({
    where: { id: project.id },
    data: {
      workspaceId: options.workspaceId,
      title,
      theme,
      heroGoal: normalizedGoal,
      templatePackSlug: selectedTemplate.slug,
      worldProfileSlug,
      mapPatternSlug,
      selectedAssetPackSlugsJson: JSON.stringify(selectedAssetPackSlugs),
      targetAudience,
      publishReadiness,
      lastEditedByUserId: options.actorUserId
    }
  });

  await upsertStarterBuildPlan({
    projectId: project.id,
    template: selectedTemplate,
    title,
    theme,
    heroGoal: normalizedGoal,
    worldProfileSlug,
    mapPatternSlug,
    selectedAssetPackSlugs
  });

  return getStudioSummary(options.workspaceId, options.actorUserId);
}

function toBuildPlanSummary(
  buildPlan:
    | {
        id: string;
        status: string;
        oneLiner?: string | null;
        coreLoop?: string | null;
        scenesJson?: string | null;
        mechanicsJson?: string | null;
        questsJson?: string | null;
        npcsJson?: string | null;
        scriptsJson?: string | null;
        artDirectionJson?: string | null;
      }
    | null
    | undefined
): StudioBuildPlanSummary | null {
  if (!buildPlan) return null;

  return {
    id: buildPlan.id,
    status: buildPlan.status,
    oneLiner: buildPlan.oneLiner ?? null,
    coreLoop: buildPlan.coreLoop ?? null,
    scenes: parseJsonArray(buildPlan.scenesJson),
    mechanics: parseJsonArray(buildPlan.mechanicsJson),
    quests: parseJsonArray(buildPlan.questsJson),
    npcs: parseJsonArray(buildPlan.npcsJson),
    scripts: parseJsonArray(buildPlan.scriptsJson),
    artDirection: parseJsonRecord(buildPlan.artDirectionJson)
  };
}

function toPublishTargetSummary(
  publishTarget:
    | {
        id: string;
        authMode: string;
        ownerType: string;
        creatorLabel?: string | null;
        reviewStatus: string;
        universeId?: string | null;
        placeId?: string | null;
        notesJson?: string | null;
      }
    | null
    | undefined
): StudioPublishTargetSummary | null {
  if (!publishTarget) return null;

  return {
    id: publishTarget.id,
    authMode: publishTarget.authMode,
    ownerType: publishTarget.ownerType,
    creatorLabel: publishTarget.creatorLabel ?? null,
    reviewStatus: publishTarget.reviewStatus,
    universeId: publishTarget.universeId ?? null,
    placeId: publishTarget.placeId ?? null,
    notes: parseJsonRecord(publishTarget.notesJson)
  };
}

function toAssetItemSummary(item: ApprovedAssetItem): StudioAssetItemSummary {
  return {
    slug: item.slug,
    title: item.title,
    kind: item.kind,
    storageMode: item.storageMode,
    sourceLabel: item.sourceLabel,
    sourceType: item.sourceType,
    summary: item.summary,
    localBundleKey: item.localBundleKey,
    localManifestPath: item.localManifestPath,
    robloxAssetId: item.robloxAssetId ?? null,
    libraryName: item.libraryName ?? null,
    creatorStoreSearch: item.creatorStoreSearch ?? null,
    targetContainer: item.targetContainer,
    targetPath: item.targetPath,
    instanceHint: item.instanceHint,
    placementHint: item.placementHint,
    worldLayer: item.worldLayer ?? null,
    biomeTags: item.biomeTags ?? [],
    zoneRoles: item.zoneRoles ?? [],
    variationHooks: item.variationHooks ?? [],
    tags: item.tags,
    buildHints: item.buildHints,
    safetyNote: item.safetyNote
  };
}

function toAssetPackSummary(pack: ApprovedAssetPack): StudioAssetPackSummary {
  return {
    slug: pack.slug,
    title: pack.title,
    shelf: pack.shelf,
    sourceLabel: pack.sourceLabel,
    sourceType: pack.sourceType,
    summary: pack.summary,
    safetyNote: pack.safetyNote,
    reviewMode: pack.reviewMode,
    ageBand: pack.ageBand,
    recommendedTemplateSlugs: pack.recommendedTemplateSlugs,
    sampleItems: pack.sampleItems,
    actions: pack.actions,
    localCatalogStatus: pack.localCatalogStatus,
    packCategory: pack.packCategory ?? null,
    worldLayer: pack.worldLayer ?? null,
    biomeTags: pack.biomeTags ?? [],
    styleTags: pack.styleTags ?? [],
    synergyPackSlugs: pack.synergyPackSlugs ?? [],
    variationHooks: pack.variationHooks ?? [],
    items: pack.items.map((item) => toAssetItemSummary(item)),
    codePackageSlugs: pack.codePackageSlugs
  };
}

function toCodePackageSummary(pkg: ApprovedCodePackage): StudioCodePackageSummary {
  return {
    slug: pkg.slug,
    title: pkg.title,
    kind: pkg.kind,
    sourceLabel: pkg.sourceLabel,
    storageMode: pkg.storageMode,
    localModulePath: pkg.localModulePath,
    targetContainer: pkg.targetContainer,
    purpose: pkg.purpose,
    starterTemplates: pkg.starterTemplates,
    worldLayers: pkg.worldLayers ?? [],
    apiShape: pkg.apiShape,
    buildHints: pkg.buildHints
  };
}

function toWorldProfileSummary(
  profile: NonNullable<ReturnType<typeof getWorldProfileBySlug>>
): StudioWorldProfileSummary {
  return {
    slug: profile.slug,
    title: profile.title,
    summary: profile.summary,
    mood: profile.mood,
    kidHook: profile.kidHook,
    starterTemplates: profile.starterTemplates,
    biomeTags: profile.biomeTags,
    skyline: profile.skyline,
    traversalStyle: profile.traversalStyle,
    zoneThemes: profile.zoneThemes,
    landmarkIdeas: profile.landmarkIdeas,
    sceneryHooks: profile.sceneryHooks,
    atmosphereHooks: profile.atmosphereHooks,
    recommendedAssetPackSlugs: profile.recommendedAssetPackSlugs,
    recommendedMapPatternSlugs: profile.recommendedMapPatternSlugs,
    variationHooks: profile.variationHooks
  };
}

function toMapPatternSummary(
  pattern: NonNullable<ReturnType<typeof getMapPatternBySlug>>
): StudioMapPatternSummary {
  return {
    slug: pattern.slug,
    title: pattern.title,
    summary: pattern.summary,
    starterTemplates: pattern.starterTemplates,
    worldProfileSlugs: pattern.worldProfileSlugs,
    zoneFrames: pattern.zoneFrames,
    traversalBeats: pattern.traversalBeats,
    landmarkRules: pattern.landmarkRules,
    spawnDescription: pattern.spawnDescription,
    finaleDescription: pattern.finaleDescription,
    recommendedAssetPackSlugs: pattern.recommendedAssetPackSlugs,
    worldLayers: pattern.worldLayers,
    variationHooks: pattern.variationHooks
  };
}

function toWorldRecipeSummary(
  recipe: ReturnType<typeof buildWorldRecipe> | null | undefined
): StudioWorldRecipeSummary | null {
  if (!recipe) return null;
  return {
    headline: recipe.headline,
    zoneSequence: recipe.zoneSequence,
    landmarkQueue: recipe.landmarkQueue,
    traversalMoments: recipe.traversalMoments,
    sceneryClusters: recipe.sceneryClusters,
    atmosphereBeats: recipe.atmosphereBeats,
    recommendedAssetPackSlugs: recipe.recommendedAssetPackSlugs,
    recommendedAssetPackTitles: recipe.recommendedAssetPackTitles,
    promptLines: recipe.promptLines,
    crewLines: recipe.crewLines
  };
}

function deriveWriterStageStatus(
  routine?: {
    status: string;
    runs: Array<{ status: string }>;
  } | null
) {
  if (!routine) return "Not started";
  if (routine.status === "Paused") return "Paused";
  const latestRun = routine.runs[0];
  if (latestRun?.status) return latestRun.status;
  return "Ready";
}

function summarizeWriterOutput(outputText?: string | null, handoffJson?: string | null) {
  const trimmedOutput = trimOrNull(outputText);
  if (trimmedOutput) {
    return trimText(trimmedOutput.replace(/\s+/g, " "), 160);
  }

  const handoff = parseJsonRecord(handoffJson);
  const summary = handoff?.summary;
  return typeof summary === "string" && summary.trim() ? trimText(summary.trim(), 160) : null;
}

async function listWriterStageSummaries(workspaceId: string): Promise<StudioWriterStageSummary[]> {
  const routines = await prisma.agentRoutine.findMany({
    where: {
      workspaceId,
      stageKey: {
        in: ROBLOX_WRITER_STAGES.map((stage) => stage.stageKey)
      }
    },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const latestByStage = new Map<string, (typeof routines)[number]>();
  for (const routine of routines) {
    if (!routine.stageKey || latestByStage.has(routine.stageKey)) continue;
    latestByStage.set(routine.stageKey, routine);
  }

  return ROBLOX_WRITER_STAGES.map((stage) => {
    const routine = latestByStage.get(stage.stageKey) ?? null;
    const latestRun = routine?.runs[0] ?? null;
    const profile = getCatProfileConfig(stage.engineProfile);

    return {
      stageKey: stage.stageKey,
      agentKey: routine?.agentKey ?? stage.agentKey,
      title: stage.title,
      mission: stage.mission,
      outputLabel: stage.outputLabel,
      handoffLabel: stage.handoffLabel,
      dependsOnStageKey: stage.dependsOnStageKey,
      engineProfile: stage.engineProfile,
      engineLabel: profile.label,
      dedicatedEngine: profile.dedicated,
      status: deriveWriterStageStatus(routine),
      routineId: routine?.id ?? null,
      draftSlug: routine?.draftSlug ?? null,
      latestRunPreview: summarizeWriterOutput(
        latestRun?.outputText,
        latestRun?.handoffJson ?? routine?.handoffJson
      ),
      latestRunAt:
        latestRun?.completedAt?.toISOString() ??
        latestRun?.startedAt?.toISOString() ??
        routine?.lastRunAt?.toISOString() ??
        null,
      handoff: parseJsonRecord(latestRun?.handoffJson ?? routine?.handoffJson ?? null)
    };
  });
}

export async function getStudioSummary(
  workspaceId: string,
  actorUserId: string
): Promise<StudioProjectSummary> {
  const [project, templates, writerStages] = await Promise.all([
    getOrCreateStudioProject(workspaceId, actorUserId),
    prisma.templatePack.findMany({ orderBy: { name: "asc" } }),
    listWriterStageSummaries(workspaceId)
  ]);

  const templateSummary = project.templatePack ? toTemplateSummary(project.templatePack) : null;
  const buildPlan = toBuildPlanSummary(project.buildPlans[0]);
  const publishTarget = toPublishTargetSummary(project.publishTargets[0]);
  const selectedAssetPackSlugs = sanitizeAssetPackSlugs(
    parseJsonArray(project.selectedAssetPackSlugsJson)
  );
  const selectedAssetPacks = getAssetPacksBySlugs(selectedAssetPackSlugs);
  const selectedAssetItems = listAssetItemsForPacks(selectedAssetPackSlugs);
  const approvedCodePackages = listApprovedCodePackagesForPacks(selectedAssetPackSlugs);
  const worldProfile =
    getWorldProfileBySlug(project.worldProfileSlug) ??
    getWorldProfileBySlug(recommendedWorldProfileSlugs(project.templatePackSlug)[0] ?? null);
  const mapPattern =
    getMapPatternBySlug(project.mapPatternSlug) ??
    getMapPatternBySlug(
      recommendedMapPatternSlugs({
        templateSlug: project.templatePackSlug,
        worldProfileSlug: worldProfile?.slug ?? null
      })[0] ?? null
    );
  const worldRecipe =
    worldProfile && mapPattern
      ? buildWorldRecipe({
          templateSlug: project.templatePackSlug,
          worldProfileSlug: worldProfile.slug,
          mapPatternSlug: mapPattern.slug,
          theme: project.theme,
          heroGoal: project.heroGoal ?? null,
          selectedAssetPackSlugs
        })
      : null;
  const lastEditedBy = project.lastEditedByUserId
    ? await prisma.user.findUnique({
        where: { id: project.lastEditedByUserId },
        select: { id: true, username: true }
      })
    : null;

  const summary = {
    id: project.id,
    slug: project.slug,
    workspaceId: project.workspaceId ?? null,
    title: project.title,
    theme: project.theme,
    heroGoal: project.heroGoal ?? null,
    targetAudience: project.targetAudience,
    connectionStatus: project.connectionStatus,
    publishReadiness: project.publishReadiness,
    parentModeEnabled: project.parentModeEnabled,
    selectedAssetPackSlugs,
    selectedAssetPacks: selectedAssetPacks.map((pack) => toAssetPackSummary(pack)),
    selectedAssetItems: selectedAssetItems.map((item) => toAssetItemSummary(item)),
    approvedCodePackages: approvedCodePackages.map((pkg) => toCodePackageSummary(pkg)),
    worldProfileSlug: worldProfile?.slug ?? null,
    mapPatternSlug: mapPattern?.slug ?? null,
    worldProfile: worldProfile ? toWorldProfileSummary(worldProfile) : null,
    mapPattern: mapPattern ? toMapPatternSummary(mapPattern) : null,
    worldRecipe: toWorldRecipeSummary(worldRecipe),
    lastEditedBy: lastEditedBy ?? null,
    updatedAt: project.updatedAt.toISOString(),
    robloxUsername: project.robloxUsername ?? null,
    robloxUserId: project.robloxUserId ?? null,
    universeId: project.universeId ?? null,
    placeId: project.placeId ?? null,
    templatePack: templateSummary,
    buildPlan,
    publishTarget,
    writerStages,
    availableTemplates: templates.map((template) => toTemplateSummary(template)),
    nextActions: buildNextActions(project)
  };

  return {
    ...summary,
    gameSections: buildGameSections(summary)
  };
}
