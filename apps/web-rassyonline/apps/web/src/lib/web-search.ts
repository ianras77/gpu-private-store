type ChatSystemMessage = {
  role: "system";
  content: string;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
  }>;
};

const SEARCH_INTENT_PATTERNS = [
  /\b(search|browse|look up|lookup|web|internet)\b/i,
  /\b(latest|recent|current|today|tonight|this week|breaking|news|release notes?|docs?|sources?|citations?)\b/i,
  /\b(weather|forecast|price|pricing|stock|score|schedule|availability|opening hours)\b/i
];

export function shouldUseWebSearch(prompt: string): boolean {
  const compact = prompt.trim();
  if (!compact) return false;
  return SEARCH_INTENT_PATTERNS.some((pattern) => pattern.test(compact));
}

export function normalizeSearchQuery(query: string): string {
  const trimmed = query.trim();
  return trimmed
    .replace(/^(please\s+)?(search|browse|look\s*up)\s+(the\s+)?(web|internet)\s+(for\s+)?/i, "")
    .replace(/^(please\s+)?(search|browse|look\s*up)\s+(for\s+)?/i, "")
    .trim() || trimmed;
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
      "Fresh web context from search.rasies.com. Use it only when relevant, cite URLs in the answer, and say when it is insufficient.",
      usable.join("\n\n")
    ].join("\n\n")
  };
}

export async function searchWebResources(query: string): Promise<WebSearchResult[]> {
  const baseUrl = process.env.RASSY_ONLINE_SEARCH_URL ?? "https://search.rasies.com";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", normalizeSearchQuery(query));
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

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
      snippet: (result.content ?? result.snippet ?? "").replace(/\s+/g, " ").trim()
    }))
    .filter((result) => result.title && result.url)
    .slice(0, 5);
}
