import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { request } from 'undici';
import { Env } from './env.js';
import { extractLlmText } from './llmText.js';

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  categories: z.string().optional(),
  language: z.string().optional()
});

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'suggestions unavailable';
}

const STATIC_SUGGESTIONS = [
  'best ways to back up family photos at home',
  'small self-hosting projects that feel fun fast',
  'easy weeknight dinners for a busy family',
  'best bedtime books for elementary kids',
  'how to organize old family videos and scans',
  'retro game night ideas for parents and kids',
  'simple Sunday reset checklist for a big household',
  'how to make a family wiki people actually use',
  'cozy backyard movie night ideas',
  'fun dashboard ideas for a family home server'
];

const SUGGESTIONS_TTL_MS = 1000 * 60 * 12;
let suggestionsCache: { expiresAt: number; suggestions: string[] } | null = null;

function normalizeSuggestionList(input: unknown, limit = 14) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => (typeof item === 'string' ? item.trim().replace(/^[-*]\s+/, '') : ''))
        .filter((item) => item.length > 0 && item.length <= 120)
    )
  ).slice(0, limit);
}

async function fetchCatSuggestions(env: Env) {
  const endpoint = new URL(env.CAT_CHAT_PATH, env.CAT_BASE_URL).toString();
  const isCheshireEndpoint = env.CAT_CHAT_PATH.includes('/message');
  const prompt =
    'Return ONLY a JSON array of 12 short internet search prompts for a self-hosted family site. Mix practical family-life searches, memory-keeping ideas, and a little homelab curiosity. No markdown, no extra text.';

  const payload = isCheshireEndpoint
    ? { text: prompt, user_id: 'search-suggestions' }
    : {
        model: env.CAT_MODEL,
        stream: false,
        messages: [
              {
                role: 'system',
                content:
                  'You generate concise search prompt suggestions for a warm family self-hosted site. Return valid JSON arrays only.'
              },
          { role: 'user', content: prompt }
        ]
      };

  const res = await request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload),
    headersTimeout: env.CAT_TIMEOUT_MS,
    bodyTimeout: env.CAT_TIMEOUT_MS
  });

  if (res.statusCode >= 400) {
    return [];
  }

  const text = await res.body.text();
  const data = safeJsonParse(text);
  const rawReply = extractLlmText(data) ?? text;

  if (Array.isArray(rawReply)) {
    return normalizeSuggestionList(rawReply);
  }

  if (typeof rawReply !== 'string') {
    return [];
  }

  const parsedReply = safeJsonParse(rawReply);
  if (Array.isArray(parsedReply)) {
    return normalizeSuggestionList(parsedReply);
  }

  const arrayMatch = rawReply.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return [];
  }

  const fromMatch = safeJsonParse(arrayMatch[0]);
  return normalizeSuggestionList(fromMatch);
}

export async function registerSearchRoutes(app: FastifyInstance, env: Env) {
  app.get('/api/search', async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }

    const { q, categories, language } = parsed.data;

    const url = new URL(env.SEARXNG_PATH, env.SEARXNG_BASE_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    if (categories) url.searchParams.set('categories', categories);
    if (language) url.searchParams.set('language', language);

    const res = await request(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      maxRedirections: 2,
      headersTimeout: env.SEARXNG_TIMEOUT_MS,
      bodyTimeout: env.SEARXNG_TIMEOUT_MS
    });

    const text = await res.body.text();
    const parsedBody = safeJsonParse(text);
    if (!parsedBody) {
      reply.code(502);
      reply.header('content-type', 'application/json; charset=utf-8');
      return {
        error: 'Search upstream returned non-JSON response',
        statusCode: res.statusCode
      };
    }

    reply.code(res.statusCode);
    reply.header('content-type', 'application/json; charset=utf-8');
    return parsedBody;
  });

  app.get('/api/search/suggestions', async (_req, reply) => {
    const now = Date.now();
    if (suggestionsCache && suggestionsCache.expiresAt > now) {
      return {
        source: 'cache',
        suggestions: suggestionsCache.suggestions
      };
    }

    try {
      const generated = await fetchCatSuggestions(env);
      const suggestions =
        generated.length >= 5
          ? generated
          : [...generated, ...STATIC_SUGGESTIONS].slice(0, 12);

      suggestionsCache = {
        suggestions,
        expiresAt: now + SUGGESTIONS_TTL_MS
      };

      return {
        source: generated.length >= 5 ? 'cheshire-cat' : 'fallback',
        suggestions
      };
    } catch (err: unknown) {
      reply.header('x-suggestions-fallback', 'true');
      const fallback = STATIC_SUGGESTIONS.slice(0, 12);
      suggestionsCache = {
        suggestions: fallback,
        expiresAt: now + 1000 * 60 * 3
      };
      return {
        source: 'fallback',
        suggestions: fallback,
        detail: errorMessage(err)
      };
    }
  });
}
