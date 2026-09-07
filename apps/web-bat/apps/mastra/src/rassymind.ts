import { config } from './config.js';

export type Capability = { alias: string; available: boolean; tools?: boolean; structuredOutput?: boolean };

export async function capabilities(): Promise<Capability[]> {
  const response = await fetch(`${config.rassyMindBaseUrl}/v1/models`, { headers: auth(), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`RassyMind catalog unavailable: ${response.status}`);
  const body = await response.json() as { data?: Array<{ id: string }> };
  const aliases = new Set((body.data ?? []).map(model => model.id));
  return ['rassy-fast','rassy-utility','rassy-mind','rassy-code','rassy-embed','rassy-rerank']
    .map(alias => ({ alias, available: aliases.has(alias) }));
}

function auth(): Record<string, string> { return config.rassyMindApiKey ? { Authorization: `Bearer ${config.rassyMindApiKey}` } : {}; }
