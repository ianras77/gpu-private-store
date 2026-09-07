import { config } from './config.js';

const headers = { 'content-type': 'application/json', authorization: `Bearer ${config.serviceToken}` };

export async function loadPersonaContext() {
  const response = await fetch(`${config.apiUrl}/api/v1/integration/persona-context?limit=5`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`persona context unavailable: ${response.status}`);
  return await response.json() as { constitution: string; persona_memory: unknown[]; voice_memory: unknown[]; recent_published: unknown[] };
}

export async function startEditorialRun(workflow: string, directive: string, personaSnapshot: Record<string, unknown> = {}) {
  const response = await fetch(`${config.apiUrl}/api/v1/integration/runs`, {
    method: 'POST', headers, body: JSON.stringify({ workflow, directive, persona_snapshot: personaSnapshot }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`editorial run persistence failed: ${response.status}`);
  return await response.json() as { id: string };
}

export async function recordEditorialStage(runId: string, stage: string, agent: string, output: Record<string, unknown>, sourceIds: string[] = []) {
  const response = await fetch(`${config.apiUrl}/api/v1/integration/runs/${runId}/stages`, {
    method: 'POST', headers, body: JSON.stringify({ stage, agent, output, source_ids: sourceIds, provider: { orchestrator: 'mastra' } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`editorial stage persistence failed: ${response.status}`);
}

export async function completeEditorialRun(runId: string, status: 'completed' | 'failed' | 'blocked' | 'published', error?: string) {
  const response = await fetch(`${config.apiUrl}/api/v1/integration/runs/${runId}/complete`, {
    method: 'POST', headers, body: JSON.stringify({ status, error }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`editorial run completion failed: ${response.status}`);
}
