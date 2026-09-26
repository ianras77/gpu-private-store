import { requiredSearchDomains, searchQueryForPrompt, searchRecencyForPrompt } from "@/lib/web-search";

export type ResearchObjective = "lookup" | "comparison" | "verification" | "timeline" | "how-to";
export type ResearchQuery = { query: string; purpose: "primary" | "left-side" | "right-side" | "freshness"; domains?: string[] };
export type ResearchPlan = {
  objective: ResearchObjective;
  queries: ResearchQuery[];
  recency?: string;
  requiredDomains: string[];
  requiresPrimarySources: boolean;
};

const comparisonPattern = /\b(?:compare|comparison|versus|vs\.?|difference(?:s)?\s+between|differentiate)\b/i;
const verificationPattern = /\b(?:verify|fact[- ]?check|confirm|is it true|validate)\b/i;
const technicalPattern = /\b(?:api|sdk|documentation|docs?|release|version|framework|library|package|cache|architecture|security)\b/i;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function comparisonSubjects(prompt: string): string[] {
  const match = prompt.match(/\b(?:compare\s+)?(.+?)\s+(?:versus|vs\.?|and)\s+(.+?)(?:\s+(?:using|with|for|on|in)\b|[?.!,]|$)/i);
  if (!match) return [];
  const clean = (value: string) => compact(value
    .replace(/^(?:compare|comparison of|the difference between)\s+/i, "")
    .replace(/\b(?:official|documentation|docs?|sources?)\b/gi, ""));
  const subjects = [clean(match[1]), clean(match[2])].filter((value) => value.length >= 2 && value.split(" ").length <= 8);
  return [...new Set(subjects.map((value) => value.toLocaleLowerCase()))].map((lower) => subjects.find((value) => value.toLocaleLowerCase() === lower)!).slice(0, 2);
}

/**
 * Creates a small, inspectable research strategy before the first network
 * request. It deliberately does not use an LLM: query planning must be fast,
 * deterministic, and unable to invent a topic or silently widen a domain.
 */
export function buildResearchPlan(prompt: string): ResearchPlan {
  const requiredDomains = requiredSearchDomains(prompt);
  const recency = searchRecencyForPrompt(prompt);
  const requiresPrimarySources = Boolean(requiredDomains.length || /\b(?:official|primary|first[- ]party)\s+(?:documentation|docs?|sources?)\b/i.test(prompt) || technicalPattern.test(prompt));
  const objective: ResearchObjective = comparisonPattern.test(prompt)
    ? "comparison"
    : verificationPattern.test(prompt)
      ? "verification"
      : recency ? "timeline"
      : /\b(?:how (?:do|does|can)|guide|tutorial|steps?)\b/i.test(prompt) ? "how-to"
      : "lookup";
  const primary = compact(prompt);
  const queries: ResearchQuery[] = [{ query: primary, purpose: "primary", ...(requiredDomains.length ? { domains: requiredDomains } : {}) }];

  if (objective === "comparison") {
    for (const [index, subject] of comparisonSubjects(prompt).entries()) {
      const query = compact(`${subject}${requiresPrimarySources ? " official documentation" : ""}`);
      if (query && query.toLocaleLowerCase() !== primary.toLocaleLowerCase()) queries.push({ query, purpose: index === 0 ? "left-side" : "right-side", ...(requiredDomains.length ? { domains: requiredDomains } : {}) });
    }
  } else if (objective === "verification" && recency) {
    const fresh = compact(`${searchQueryForPrompt(prompt)} latest official source`);
    if (fresh && fresh.toLocaleLowerCase() !== primary.toLocaleLowerCase()) queries.push({ query: fresh, purpose: "freshness", ...(requiredDomains.length ? { domains: requiredDomains } : {}) });
  }

  const seen = new Set<string>();
  return { objective, queries: queries.filter((entry) => {
    const key = entry.query.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4), recency, requiredDomains, requiresPrimarySources };
}

export function buildResearchPlanContext(plan: ResearchPlan): string {
  return `RESEARCH PLAN: objective=${plan.objective}; source_policy=${plan.requiresPrimarySources ? "prefer primary or official sources" : "use directly relevant sources"}; freshness=${plan.recency ?? "not explicitly time-bounded"}; query_lanes=${plan.queries.map((entry) => `${entry.purpose}:${entry.query}`).join(" | ")}. Do not answer a comparison from one side only; identify any uncovered dimension.`;
}
