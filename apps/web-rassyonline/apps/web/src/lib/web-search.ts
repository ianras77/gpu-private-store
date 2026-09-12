type ChatSystemMessage = {
  role: "system";
  content: string;
};

export type WebSearchResult = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  snippet: string;
  status?: "ok";
};

type SearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
    publishedDate?: string;
    published_at?: string;
  }>;
};

const SEARCH_INTENT_PATTERNS = [
  /\b(search|browse|look up|lookup|web|internet)\b/i,
  /\b(latest|recent|current|today|tonight|this week|breaking|news|release notes?|docs?|sources?|citations?)\b/i,
  /\b(weather|forecast|price|pricing|stock|score|schedule|availability|opening hours)\b/i
];
const SEARCH_EXCLUSIONS = [/^what does .* mean\??$/i, /^explain\b/i, /^rewrite\b/i, /^summari[sz]e this\b/i];

export function shouldUseWebSearch(prompt: string): boolean {
  const compact = prompt.trim();
  if (!compact) return false;
  return !SEARCH_EXCLUSIONS.some((pattern) => pattern.test(compact)) && SEARCH_INTENT_PATTERNS.some((pattern) => pattern.test(compact));
}

export function normalizeSearchQuery(query: string): string {
  const trimmed = query.trim();
  return trimmed
    .replace(/^(please\s+)?(search|browse|look\s*up)\s+(the\s+)?(web|internet)\s+(for\s+)?/i, "")
    .replace(/^(please\s+)?(search|browse|look\s*up)\s+(for\s+)?/i, "")
    .trim() || trimmed;
}

export function searchQueryForPrompt(query: string): string {
  return normalizeSearchQuery(query).replace(/\b(can you|could you|would you|please|tell me|i want to know)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function searchRecencyForPrompt(prompt: string): string | undefined {
  if (/\b(today|tonight|right now|currently|latest|breaking|live)\b/i.test(prompt)) return "day";
  if (/\b(this week|recent|new)\b/i.test(prompt)) return "week";
  if (/\b(this month)\b/i.test(prompt)) return "month";
  return undefined;
}

export function buildSearchContextMessage(results: WebSearchResult[]): ChatSystemMessage | null {
  const usable = results
    .filter((result) => result.title && result.url)
    .slice(0, 5)
    .map((result, index) => [`[${index + 1}] ${result.title}`, result.url, result.snippet].filter(Boolean).join("\n"));

  if (!usable.length) return null;

  return {
    role: "system",
    content: [
      "AUTHORITATIVE FRESH WEB EVIDENCE: The following results were retrieved for this turn and are available to you now. Answer from this evidence when it addresses the user request. Do not say you cannot browse or claim the search did not happen. If the evidence is insufficient or off-topic, say that plainly and do not invent facts or URLs. Cite only URLs included below.",
      usable.join("\n\n")
    ].join("\n\n")
  };
}

export async function searchWebResources(query: string, options: Pick<WebSearchInput, "recency" | "domains" | "max_results"> = {}): Promise<WebSearchResult[]> {
  const baseUrl = process.env.RASSY_ONLINE_SEARCH_URL ?? "https://search.rasies.com";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", searchQueryForPrompt(query));
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");
  if (options.recency) url.searchParams.set("time_range", options.recency);
  if (options.domains?.length) url.searchParams.set("indices", options.domains.join(","));

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`search.rasies.com failed: ${response.status}`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > 2 * 1024 * 1024) throw new Error("search response too large");
  const parsed = JSON.parse(new TextDecoder().decode(body)) as SearchResponse;
  return (Array.isArray(parsed.results) ? parsed.results : [])
    .map((result) => ({
      title: result.title?.trim() ?? "",
      url: result.url?.trim() ?? "",
      source: (() => { try { return new URL(result.url ?? "").hostname; } catch { return ""; } })(),
      publishedAt: result.publishedDate ?? result.published_at,
      snippet: (result.content ?? result.snippet ?? "").replace(/\s+/g, " ").trim(),
      status: "ok" as const
    }))
    .filter((result) => result.title && result.url)
    .slice(0, Math.min(options.max_results ?? 5, 8));
}

export type WebSearchInput = { query: string; recency?: string; domains?: string[]; max_results?: number };

export function unsupportedCitationUrls(answer: string, returnedUrls: string[]): string[] {
  const allowed = new Set(returnedUrls);
  return [...answer.matchAll(/https?:\/\/[^\s)\]>]+/g)].map((match) => match[0].replace(/[.,;]+$/, "")).filter((url, index, all) => !allowed.has(url) && all.indexOf(url) === index);
}

export async function executeWebSearch(input: WebSearchInput): Promise<{ status: "ok" | "empty" | "failed"; results: WebSearchResult[] }> {
  try {
    const results = await searchWebResources(input.query, { ...input, recency: input.recency ?? searchRecencyForPrompt(input.query) });
    return { status: results.length ? "ok" : "empty", results };
  } catch {
    return { status: "failed", results: [] };
  }
}
