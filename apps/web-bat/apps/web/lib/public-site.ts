import { unstable_noStore as noStore } from "next/cache";

import { apiGet } from "@/lib/api";

export type StoryCard = {
  title?: string;
  slug?: string;
  object_type?: string;
  status?: string;
  why_now?: string;
  social_hook?: string;
  pattern_signals?: string[];
};

export type HomepageSnapshot = {
  id: string;
  status: string;
  layout_json: {
    edition?: string;
    tagline?: string;
    edition_theme?: string;
    lead_angle?: string;
    lead?: {
      title?: string;
      slug?: string;
      dek?: string;
      status?: string;
      why_now?: string;
      pull_quote?: string;
      pattern_signals?: string[];
      social_hook?: string;
    };
    left_column?: StoryCard[];
    center_column?: StoryCard[];
    right_column?: StoryCard[];
    runway?: StoryCard[];
    watchlist?: WatchTheme[];
    social_rollout?: SocialRollout[];
    signal_links?: CuratedLink[];
    signal_links_label?: string;
    queen_links?: CuratedLink[];
    queen_label?: string;
    queen_note?: string;
  };
};

export type SourceMix = {
  count?: number;
  avg_quality?: number;
  top_outlets?: string[];
  freshest_age_days?: number | null;
  high_credibility_count?: number;
};

export type StyleGate = {
  lane?: string;
  score?: number;
  passes?: boolean;
  reasons?: string[];
  hard_fail?: boolean;
  threshold?: number;
};

export type ContradictionMapItem = {
  title?: string;
  outlet?: string;
  age_days?: number;
  quality_score?: number;
  credibility_tier?: string;
};

export type CuratedLink = {
  title?: string;
  url?: string;
  source_name?: string;
  source_kind?: string;
  quality_score?: number;
  credibility_tier?: string;
};

export type Theme = {
  id?: string;
  slug: string;
  name: string;
  description?: string;
  active_score: number;
  last_seen_at?: string;
  metadata?: {
    updated_at?: string;
    membership_count?: number;
  };
};

export type WatchTheme = {
  slug?: string;
  name?: string;
  description?: string;
  active_score?: number;
};

export type SocialRollout = {
  variant?: string;
  body?: string;
  status?: string;
  published_at?: string | null;
};

export type RetrievalSource = {
  id?: string;
  title?: string;
  url?: string;
  source_name?: string;
  source_label?: string;
  quality_score?: number;
  credibility_tier?: string;
};

export type RetrievalBundle = {
  query_text?: string;
  focus_theme?: {
    name?: string;
    slug?: string;
    active_score?: number;
  };
  raw_sources?: RetrievalSource[];
  theme_memory?: Theme[];
  trend_ledger?: Array<{
    title?: string;
    summary?: string;
    confidence?: number;
    change_type?: string;
    observation_date?: string;
  }>;
  retrieval_diagnostics?: {
    theme_rejected?: number;
    recent_rejected?: number;
    vector_rejected?: number;
    theme_candidates?: number;
    recent_candidates?: number;
    vector_candidates?: number;
  };
};

export type StoryMetadata = {
  why_now?: string;
  grounded?: boolean;
  theme_slug?: string | null;
  source_mix?: SourceMix;
  style_gate?: StyleGate;
  story_brief?: {
    why_now?: string;
    story_mode?: string;
    theme_slug?: string | null;
    focus_label?: string;
    audience_hook?: string;
    selected_angle?: string;
    freshest_evidence?: string;
    source_mix?: SourceMix;
    social_hooks?: string[];
    trend_signal?: string;
    theme_context?: string;
    contradiction_map?: ContradictionMapItem[];
  };
  launch_packet?: {
    why_now?: string;
    pull_quote?: string;
    story_mode?: string;
    selected_angle?: string;
    social_hooks?: string[];
    pattern_signals?: string[];
    quote_card_line?: string;
    headline_variants?: string[];
  };
  retrieval_bundle?: RetrievalBundle;
  contradiction_map?: ContradictionMapItem[];
  poster_package?: {
    eyebrow?: string;
    share_title?: string;
    share_dek?: string;
    quote_card_line?: string;
    screenshot_lines?: string[];
    group_chat_caption?: string;
  };
  social_package?: {
    dispatch?: string;
    quote_card?: string;
    thread?: string[];
  };
  publish_recommendation?: {
    recommended?: boolean;
    reason?: string;
    style_score?: number;
    reroll_count?: number;
    freshness_age_days?: number;
    grounded_source_count?: number;
  };
};

export type Editorial = {
  id: string;
  title: string;
  slug: string;
  object_type: string;
  status: string;
  created_at: string;
  published_at?: string | null;
  dek?: string;
  summary?: string;
  body_md?: string;
  metadata?: StoryMetadata;
};

export type PipelineRole = {
  role: string;
  title: string;
  description: string;
  plugins?: string[];
  outputs?: string[];
};

export type Opportunity = {
  slug?: string;
  angle?: string;
  score?: number;
  theme?: string;
  query_hint?: string;
};

export type ResearcherResult = {
  query_plan?: string[];
  query_count?: number;
  themes_active?: number;
  source_quality_mix?: {
    x_sources?: number;
    fresh_sources?: number;
    high_quality_kept?: number;
  };
  opportunity_board?: Opportunity[];
};

export type WriterSlateItem = {
  id?: string;
  slug?: string;
  title?: string;
  status?: string;
  why_now?: string;
  object_type?: string;
  social_hooks?: string[];
  selected_angle?: string;
};

export type WriterResult = {
  story_slate?: WriterSlateItem[];
};

export type AnalystResult = {
  site_brief?: {
    label?: string;
    title?: string;
    confidence?: number;
    updated_at?: string;
  };
  theme_briefs?: Array<{
    scope_key?: string;
    label?: string;
    title?: string;
    confidence?: number;
  }>;
  brief_count?: number;
  tone_distribution?: Record<string, number>;
  role_distribution?: Record<string, number>;
  story_target_distribution?: Record<string, number>;
};

export type QueenResult = {
  curated_links?: CuratedLink[];
  social_rollout?: SocialRollout[];
};

export type PipelineStage = {
  stage?: string;
  event?: string;
  at?: string;
  result?: ResearcherResult | WriterResult | QueenResult | null;
  error?: string | null;
};

export type PipelineCycle = {
  cycle_id?: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  stages?: PipelineStage[];
  phase?: string;
};

export type PipelineTelemetry = {
  cycle_interval_minutes?: number;
  roles?: PipelineRole[];
  latest_cycle?: PipelineCycle | null;
  latest_by_phase?: Record<string, PipelineCycle>;
};

type Storyish = Partial<StoryCard> & Partial<Editorial>;

const themeFallbackNarratives: Record<string, string> = {
  "executive-overreach": "The moments when Trump-world tries to govern by dare, memo, or raw force instead of durable authority.",
  "legal-collision": "The court fights, blocks, and humiliations that show where executive fantasy meets an actual institution.",
  "family-dynastic-branding": "The spots where politics curdles into family business, logo management, and inherited entitlement.",
  "culture-war-cosmetics": "The decorative outrage, costume drama, and symbolic bait that try to distract from the harder story underneath.",
  "loyalty-theater": "Public performances of obedience, punishment, and courtier behavior meant to prove who still belongs in the inner ring.",
  "conservative-discomfort": "The tells that something inside the broader right knows the line is wobbling, even if nobody says it cleanly yet.",
  "policy-chaos-hidden-behind-style": "The slick branding jobs that hide improvisation, sloppiness, or plain old policy failure.",
  "institutional-humiliation": "When an institution bends, stalls, or embarrasses itself rather than meet the moment with dignity.",
  "elite-image-management": "High-status smoothing, laundering, and self-protection dressed up as sophistication.",
  "propaganda-repetition": "The slogans and talking points that keep coming back until repetition itself becomes the strategy.",
  "foreign-policy-escalation": "The moments when White House swagger runs headfirst into a widening regional conflict and the consequences stop staying overseas.",
  "military-brinkmanship": "Threat displays, strike chatter, troop posture, and the rituals of calling escalation a form of control.",
  "allied-anxiety": "The nervous chorus from allies, partners, and even fellow Republicans when the room can feel the risk widening.",
  "energy-shock-politics": "Oil, shipping, gas-price nerves, and the domestic political bill that arrives after foreign-policy chaos.",
  "war-room-narrative-spin": "The cleanups, walk-backs, and briefing-room rewrites that show the story is moving faster than the message.",
};

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function byNewest(a?: string | null, b?: string | null): number {
  const left = a ? Date.parse(a) : 0;
  const right = b ? Date.parse(b) : 0;
  return right - left;
}

function pickStageResult<T>(stages: PipelineStage[] | undefined, stageName: string): T | null {
  const match = stages?.find((stage) => stage.stage === stageName && stage.event === "stage_completed");
  return (match?.result as T | undefined) ?? null;
}

function fulfilledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export function cleanCopy(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/[*_`#]/g, "")
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function humanizeSlug(value?: string | null): string {
  const cleaned = cleanCopy(value);
  if (!cleaned) {
    return "";
  }

  return cleaned
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function isPlaceholderTitle(value?: string | null): boolean {
  const cleaned = cleanCopy(value);
  if (!cleaned) {
    return false;
  }

  return /^(headline|title|dek|paragraph\s*\d+|draft pending source refresh|no lead yet)\s*:?\s*$/i.test(cleaned);
}

export function titleFromSlug(slug?: string | null): string {
  if (!slug) {
    return "Untitled dispatch";
  }

  const trimmed = slug.replace(/-\d{6}-[a-f0-9]{8}$/i, "");
  return humanizeSlug(trimmed);
}

export function resolveTitle(
  item: { title?: string | null; slug?: string | null } | undefined,
  titleBySlug: Map<string, string>,
): string {
  const explicitTitle = cleanCopy(item?.title);
  if (explicitTitle && !isPlaceholderTitle(explicitTitle)) {
    return explicitTitle;
  }

  const fromLookup = item?.slug ? cleanCopy(titleBySlug.get(item.slug)) : "";
  if (fromLookup && !isPlaceholderTitle(fromLookup)) {
    return fromLookup;
  }

  return titleFromSlug(item?.slug);
}

export function storySummary(story?: Storyish | null): string {
  const metadata = story?.metadata;
  const candidates = [
    story?.why_now,
    story?.social_hook,
    metadata?.launch_packet?.why_now,
    metadata?.story_brief?.why_now,
    metadata?.story_brief?.selected_angle,
    story?.summary,
    story?.dek,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanCopy(candidate);
    if (cleaned && !isPlaceholderTitle(cleaned)) {
      return cleaned;
    }
  }

  return "The contradiction is live, the receipts are warm, and this one still belongs on the front table.";
}

export function storyQuote(story?: Editorial | null): string {
  const metadata = story?.metadata;
  const quote = firstDefined(
    metadata?.launch_packet?.pull_quote,
    metadata?.launch_packet?.quote_card_line,
    metadata?.poster_package?.quote_card_line,
  );

  const cleaned = cleanCopy(quote);
  return cleaned && !isPlaceholderTitle(cleaned) ? cleaned : "";
}

export function storyHooks(story?: Editorial | null): string[] {
  return uniqueStrings([
    ...(story?.metadata?.launch_packet?.social_hooks ?? []),
    ...(story?.metadata?.story_brief?.social_hooks ?? []),
    story?.metadata?.poster_package?.group_chat_caption,
    story?.metadata?.social_package?.dispatch,
    story?.metadata?.social_package?.quote_card,
  ]);
}

export function themeName(theme?: Pick<Theme, "name" | "slug"> | null): string {
  const named = cleanCopy(theme?.name);
  if (named) {
    return named;
  }
  return humanizeSlug(theme?.slug);
}

export function themeNarrative(theme?: Pick<Theme, "slug" | "description"> | null): string {
  const cleanedDescription = cleanCopy(theme?.description);

  if (cleanedDescription && !/^recurring pattern bucket:/i.test(cleanedDescription)) {
    return cleanedDescription;
  }

  return themeFallbackNarratives[theme?.slug ?? ""] ?? "A recurring Trump-world pattern I keep nearby because it never stays quiet for long.";
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const cleaned = cleanCopy(value);
    if (!cleaned || isPlaceholderTitle(cleaned)) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(cleaned);
  }

  return next;
}

export function sortByNewest<T extends { published_at?: string | null; created_at?: string | null; last_seen_at?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) =>
    byNewest(
      left.published_at ?? left.last_seen_at ?? left.created_at,
      right.published_at ?? right.last_seen_at ?? right.created_at,
    ),
  );
}

export type PublicSiteData = {
  snapshot: HomepageSnapshot | null;
  titleBySlug: Map<string, string>;
  publishedStories: Editorial[];
  draftStories: Editorial[];
  themes: Theme[];
  activeThemes: Theme[];
  leadStory: Editorial | null;
  pipelineRoles: PipelineRole[];
  latestCycle: PipelineCycle | null;
  researcherResult: ResearcherResult | null;
  analystResult: AnalystResult | null;
  writerResult: WriterResult | null;
  queenResult: QueenResult | null;
  opportunityBoard: Opportunity[];
  queryPlan: string[];
  watchlist: WatchTheme[];
  curatedLinks: CuratedLink[];
  queenLinks: CuratedLink[];
  liveSocialLines: string[];
};

export async function getPublicSiteData(): Promise<PublicSiteData> {
  noStore();

  const [snapshotResult, editorialResult, themesResult, pipelineResult] = await Promise.allSettled([
    apiGet<HomepageSnapshot[]>("/api/v1/homepage/snapshots"),
    apiGet<Editorial[]>("/api/v1/editorial/objects?limit=120"),
    apiGet<Theme[]>("/api/v1/themes"),
    apiGet<PipelineTelemetry>("/api/v1/admin/pipeline"),
  ]);

  const snapshots = fulfilledValue(snapshotResult, []);
  const editorial = sortByNewest(fulfilledValue(editorialResult, []));
  const themes = sortByNewest(fulfilledValue(themesResult, []));
  const pipeline = fulfilledValue(pipelineResult, { roles: [], latest_cycle: null });
  const snapshot = snapshots[0] ?? null;

  const titleBySlug = new Map<string, string>();
  for (const row of editorial) {
    if (!row.slug) {
      continue;
    }
    const cleaned = cleanCopy(row.title);
    if (!cleaned || isPlaceholderTitle(cleaned)) {
      continue;
    }
    titleBySlug.set(row.slug, cleaned);
  }

  const publishedStories = editorial.filter(
    (row) => row.status === "published" && !!cleanCopy(row.title) && !isPlaceholderTitle(row.title),
  );
  const draftStories = editorial.filter((row) => row.status !== "published");

  const snapshotLeadSlug = snapshot?.layout_json?.lead?.slug;
  const snapshotLeadStory = snapshotLeadSlug ? editorial.find((row) => row.slug === snapshotLeadSlug) ?? null : null;
  const publishedLeadStory = publishedStories.find((row) => row.object_type === "lead_story") ?? null;
  const leadStory =
    snapshotLeadStory && !isPlaceholderTitle(snapshotLeadStory.title)
      ? snapshotLeadStory
      : publishedLeadStory ?? publishedStories[0] ?? null;

  const latestCycle = pipeline.latest_cycle ?? null;
  const researchCycle = pipeline.latest_by_phase?.research ?? latestCycle;
  const editorialCycle = pipeline.latest_by_phase?.editorial ?? latestCycle;
  const pipelineRoles = pipeline.roles ?? [];
  const researcherResult = pickStageResult<ResearcherResult>(researchCycle?.stages, "researcher");
  const analystResult = pickStageResult<AnalystResult>(researchCycle?.stages, "analyst");
  const writerResult = pickStageResult<WriterResult>(editorialCycle?.stages, "writer");
  const queenResult = pickStageResult<QueenResult>(editorialCycle?.stages, "queen");

  const opportunityBoard = researcherResult?.opportunity_board ?? [];
  const queryPlan = researcherResult?.query_plan ?? [];

  const watchlist = snapshot?.layout_json?.watchlist?.length
    ? snapshot.layout_json.watchlist
    : themes.slice(0, 6).map((theme) => ({
        slug: theme.slug,
        name: theme.name,
        description: themeNarrative(theme),
        active_score: theme.active_score,
      }));

  const curatedLinks = snapshot?.layout_json?.signal_links?.length
    ? snapshot.layout_json.signal_links
    : queenResult?.curated_links ?? [];

  const queenLinks = snapshot?.layout_json?.queen_links?.length
    ? snapshot.layout_json.queen_links
    : curatedLinks;

  const liveSocialLines = uniqueStrings([
    ...(snapshot?.layout_json?.social_rollout ?? []).map((item) => item.body),
    ...(writerResult?.story_slate ?? []).flatMap((item) => item.social_hooks ?? []),
    ...(writerResult?.story_slate ?? []).map((item) => item.selected_angle),
    ...publishedStories.flatMap((story) => storyHooks(story)),
  ]);

  return {
    snapshot,
    titleBySlug,
    publishedStories,
    draftStories,
    themes,
    activeThemes: themes.slice(0, 6),
    leadStory,
    pipelineRoles,
    latestCycle,
    researcherResult,
    analystResult,
    writerResult,
    queenResult,
    opportunityBoard,
    queryPlan,
    watchlist,
    curatedLinks,
    queenLinks,
    liveSocialLines,
  };
}
