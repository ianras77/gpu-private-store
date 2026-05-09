export type StudioTemplateSummary = {
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
  starterQuestText?: string | null;
  artDirection?: string | null;
};

export type StudioBuildPlanSummary = {
  id: string;
  status: string;
  oneLiner?: string | null;
  coreLoop?: string | null;
  scenes: string[];
  mechanics: string[];
  quests: string[];
  npcs: string[];
  scripts: string[];
  artDirection: Record<string, unknown> | null;
};

export type StudioAssetItemSummary = {
  slug: string;
  title: string;
  kind: string;
  storageMode: string;
  sourceLabel: string;
  sourceType: string;
  summary: string;
  localBundleKey: string;
  localManifestPath: string;
  robloxAssetId?: string | null;
  libraryName?: string | null;
  creatorStoreSearch?: string | null;
  targetContainer: string;
  targetPath: string;
  instanceHint: string;
  placementHint: string;
  worldLayer?: string | null;
  biomeTags?: string[];
  zoneRoles?: string[];
  variationHooks?: string[];
  tags: string[];
  buildHints: string[];
  safetyNote: string;
};

export type StudioAssetPackSummary = {
  slug: string;
  title: string;
  shelf: string;
  sourceLabel: string;
  sourceType: string;
  summary: string;
  safetyNote: string;
  reviewMode: string;
  ageBand: string;
  recommendedTemplateSlugs: string[];
  sampleItems: string[];
  actions: string[];
  localCatalogStatus: string;
  packCategory?: string | null;
  worldLayer?: string | null;
  biomeTags?: string[];
  styleTags?: string[];
  synergyPackSlugs?: string[];
  variationHooks?: string[];
  items: StudioAssetItemSummary[];
  codePackageSlugs: string[];
};

export type StudioCodePackageSummary = {
  slug: string;
  title: string;
  kind: string;
  sourceLabel: string;
  storageMode: string;
  localModulePath: string;
  targetContainer: string;
  purpose: string;
  starterTemplates: string[];
  worldLayers?: string[];
  apiShape: string[];
  buildHints: string[];
};

export type StudioWorldProfileSummary = {
  slug: string;
  title: string;
  summary: string;
  mood: string;
  kidHook: string;
  starterTemplates: string[];
  biomeTags: string[];
  skyline: string;
  traversalStyle: string;
  zoneThemes: string[];
  landmarkIdeas: string[];
  sceneryHooks: string[];
  atmosphereHooks: string[];
  recommendedAssetPackSlugs: string[];
  recommendedMapPatternSlugs: string[];
  variationHooks: string[];
};

export type StudioMapPatternSummary = {
  slug: string;
  title: string;
  summary: string;
  starterTemplates: string[];
  worldProfileSlugs: string[];
  zoneFrames: string[];
  traversalBeats: string[];
  landmarkRules: string[];
  spawnDescription: string;
  finaleDescription: string;
  recommendedAssetPackSlugs: string[];
  worldLayers: string[];
  variationHooks: string[];
};

export type StudioWorldRecipeSummary = {
  headline: string;
  zoneSequence: string[];
  landmarkQueue: string[];
  traversalMoments: string[];
  sceneryClusters: string[];
  atmosphereBeats: string[];
  recommendedAssetPackSlugs: string[];
  recommendedAssetPackTitles: string[];
  promptLines: string[];
  crewLines: string[];
};

export type StudioPublishTargetSummary = {
  id: string;
  authMode: string;
  ownerType: string;
  creatorLabel?: string | null;
  reviewStatus: string;
  universeId?: string | null;
  placeId?: string | null;
  notes: Record<string, unknown> | null;
};

export type StudioWriterStageSummary = {
  stageKey: string;
  agentKey: string;
  title: string;
  mission: string;
  outputLabel: string;
  handoffLabel: string;
  dependsOnStageKey?: string;
  engineProfile: string;
  engineLabel: string;
  dedicatedEngine: boolean;
  status: string;
  routineId?: string | null;
  draftSlug?: string | null;
  latestRunPreview?: string | null;
  latestRunAt?: string | null;
  handoff?: Record<string, unknown> | null;
};

export type StudioProjectSummary = {
  id: string;
  slug: string;
  workspaceId?: string | null;
  title: string;
  theme: string;
  heroGoal?: string | null;
  targetAudience: string;
  connectionStatus: string;
  publishReadiness: string;
  parentModeEnabled: boolean;
  selectedAssetPackSlugs: string[];
  selectedAssetPacks: StudioAssetPackSummary[];
  selectedAssetItems: StudioAssetItemSummary[];
  approvedCodePackages: StudioCodePackageSummary[];
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  worldProfile: StudioWorldProfileSummary | null;
  mapPattern: StudioMapPatternSummary | null;
  worldRecipe: StudioWorldRecipeSummary | null;
  lastEditedBy?: {
    id: string;
    username: string | null;
  } | null;
  updatedAt: string;
  robloxUsername?: string | null;
  robloxUserId?: string | null;
  universeId?: string | null;
  placeId?: string | null;
  templatePack: StudioTemplateSummary | null;
  buildPlan: StudioBuildPlanSummary | null;
  publishTarget: StudioPublishTargetSummary | null;
  writerStages: StudioWriterStageSummary[];
  availableTemplates: StudioTemplateSummary[];
  nextActions: string[];
};
