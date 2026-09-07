import { randomUUID } from 'node:crypto';
import { researchRequest, researchPacket, type ResearchPacket } from './schemas.js';
import { listSourcesTool } from './tools.js';
import { generateEditorial } from './agents.js';
import { config } from './config.js';
import { reportArtifact, type ReportArtifact } from './report.js';
import { completeEditorialRun, loadPersonaContext, recordEditorialStage, startEditorialRun } from './integration.js';

/** The first newsroom workflow is deliberately deterministic at its boundary:
 * search and source policy remain owned by BAT API; model reasoning is added
 * only after this packet contract is qualified. */
export async function researchWorkflow(input: unknown): Promise<ResearchPacket> {
  const request = researchRequest.parse(input);
  const run = await startEditorialRun('research', request.directive);
  const raw = await listSourcesTool.execute!({ query: request.directive, limit: request.maxSources }, {} as never) as { sources?: Array<{ id?: string; title?: string; url?: string }> };
  const sources = (raw.sources ?? []).filter((source): source is { id: string; title: string; url: string } => Boolean(source.id && source.title && source.url));
  const packet = researchPacket.parse({ id: randomUUID(), generatedAt: new Date().toISOString(), directive: request.directive, sources, weakEvidenceWarnings: sources.length ? [] : ['No policy-approved sources were returned. No freshness claim is permitted.'] });
  await recordEditorialStage(run.id, 'research', 'bat-researcher', { packet_id: packet.id, source_count: sources.length, warnings: packet.weakEvidenceWarnings }, sources.map(source => source.id));
  await completeEditorialRun(run.id, 'completed');
  return packet;
}

export async function reportWorkflow(input: unknown): Promise<ReportArtifact> {
  const request = researchRequest.parse(input);
  const packet = await researchWorkflow(request);
  const chapters = packet.sources.slice(0, Math.max(3, Math.min(5, packet.sources.length))).map((source, index) => ({
    id: `chapter-${index + 1}`, title: source.title, thesis: `What the available record says about ${source.title}.`,
    bodyMarkdown: `## ${source.title}\n\nThis chapter is reserved for grounded editorial synthesis from the approved source record. [Source](<${source.url}>).`, sourceIds: [source.id],
  }));
  const requestedRunId = typeof input === 'object' && input !== null && 'runId' in input && typeof (input as { runId?: unknown }).runId === 'string' ? (input as { runId: string }).runId : packet.id;
  const artifact = reportArtifact.parse({ schemaVersion: '1', id: randomUUID(), kind: 'theme-dossier', title: request.directive,
    executiveSummary: packet.sources.length ? 'A source-grounded report is ready for editorial review.' : 'No approved sources were available; this report cannot make freshness claims.',
    keyFindings: packet.sources.map(source => source.title).slice(0, 5), chapters, sourceIds: packet.sources.map(source => source.id),
    sourceNotes: packet.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url })), timeline: [], generatedAt: new Date().toISOString(), runId: requestedRunId,
    factCheck: { passed: packet.sources.length > 0, confidence: packet.sources.length ? 0.5 : 0, requiredFixes: packet.sources.length ? [] : ['Gather approved sources before publication.'] },
  });
  if (config.persistReports && typeof input === 'object' && input !== null && 'runId' in input && typeof (input as { runId?: unknown }).runId === 'string') {
    const runId = (input as { runId: string }).runId;
    const slug = `${artifact.kind}-${artifact.id}`;
    const response = await fetch(`${config.apiUrl}/api/v1/reports/artifacts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.serviceToken}` }, body: JSON.stringify({ run_id: runId, slug, kind: artifact.kind, title: artifact.title, artifact, source_ids: artifact.sourceIds }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`report persistence failed: ${response.status}`);
  }
  return artifact;
}

export type WorkflowResult = { workflow: string; status: 'ready'; researchPacketId: string; stages: string[] };

export type StoryWorkflowResult = {
  workflow: 'story'; status: 'ready'; runId: string; title: string; dek: string; body: string;
  sourceIds: string[]; factCheck: { passed: boolean; notes: string[] };
};

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch {
    try {
      // Small models occasionally emit malformed JSON around long Markdown.
      // Repair only invalid escapes first; never silently invent fields.
      parsed = JSON.parse(cleaned.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')) as unknown;
    } catch {
      const fallback: Record<string, unknown> = {};
      const title = cleaned.match(/"title"\s*:\s*"([^"]*)"/i);
      const dek = cleaned.match(/"dek"\s*:\s*"([^"]*)"/i);
      const body = cleaned.match(/"body_markdown"\s*:\s*"([\s\S]*)/i);
      const passed = cleaned.match(/"passed"\s*:\s*(true|false)/i);
      if (title) fallback.title = title[1];
      if (dek) fallback.dek = dek[1];
      if (body) fallback.body_markdown = body[1].replace(/"\s*[,}]?\s*$/, '').replace(/\\"/g, '"');
      if (passed) fallback.passed = passed[1].toLowerCase() === 'true';
      if (!Object.keys(fallback).length) throw new Error('agent returned malformed JSON');
      parsed = fallback;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('agent returned a non-object payload');
  return parsed as Record<string, unknown>;
}

/** Real Mastra-owned story path. The API remains the evidence/persistence
 * plane; Mastra owns the editorial judgment and agent sequence. */
export async function editorialStoryWorkflow(input: unknown): Promise<StoryWorkflowResult> {
  const request = researchRequest.parse(input);
  const persona = await loadPersonaContext();
  const run = await startEditorialRun('story', request.directive, { voice: 'Mirror, Pin, Twist', context: persona });
  try {
    const raw = await listSourcesTool.execute!({ query: request.directive, limit: Math.max(request.maxSources, 20) }, {} as never) as { sources?: Array<{ id?: string; title?: string; url?: string; evidence?: string }> };
    const terms = request.directive.toLowerCase().split(/[^a-z0-9$]+/).filter(term => term.length > 3);
    const sources = (raw.sources ?? []).filter((source): source is { id: string; title: string; url: string; evidence: string } => Boolean(source.id && source.title && source.url))
      .sort((left, right) => {
        const score = (source: { title: string; evidence: string }) => terms.reduce((total, term) => total + (source.title.toLowerCase().includes(term) ? 3 : 0) + (source.evidence.toLowerCase().includes(term) ? 1 : 0), 0);
        return score(right) - score(left);
      }).slice(0, 5);
    if (sources.length < 3) throw new Error('story workflow requires at least three approved sources');
    await recordEditorialStage(run.id, 'research', 'bat-researcher', { directive: request.directive, source_count: sources.length }, sources.map(source => source.id));
    const evidence = sources.map(source => `${source.id} | ${source.title} | ${source.url}\nRECEIPT:\n${source.evidence.slice(0, 900)}`).join('\n');
    const writerResult = await generateEditorial(`Return JSON with title, dek, and body_markdown. Write a short, specific personal-blogger editorial about: ${request.directive}. Use only facts explicitly present in RECEIPT text. Every factual sentence must end with the exact source ID that supports it in [source_id="..."] form. Quote or closely paraphrase the receipts; do not invent context, names, numbers, events, or source IDs. Clearly label any opinion as opinion. If evidence is weak, write a narrower piece.\nPERSONA CONTEXT:\n${JSON.stringify(persona)}\nAPPROVED SOURCES:\n${evidence}`);
    const draft = extractJson(writerResult.text);
    const sourceIds = sources.map(source => source.id);
    await recordEditorialStage(run.id, 'writer', 'bat-writer', { ...draft }, sourceIds);
    let finalDraft = draft;
    let fact = extractJson((await generateEditorial(`Return JSON with passed (boolean) and notes (string array). Check the draft for factual claims, quotations, numbers, dates, named events, and source attributions that are unsupported by the receipts. Clearly signaled opinion, metaphor, satire, and editorial analysis are allowed, but must not introduce new factual assertions. Set passed true when factual claims are grounded and the analysis is visibly framed as analysis.\nSOURCES:\n${evidence}\nDRAFT:\n${writerResult.text}`)).text);
    await recordEditorialStage(run.id, 'fact-check', 'bat-fact-checker', { ...fact }, sourceIds);
    if (fact.passed !== true) {
      const revision = await generateEditorial(`Return JSON with title, dek, and body_markdown. Revise this draft to remove unsupported factual claims identified by the fact checker. Keep clearly signaled opinion, metaphor, satire, and editorial analysis. Use only the exact source IDs in APPROVED SOURCES; never invent or reuse any other source ID.\nAPPROVED SOURCES:\n${evidence}\nFACT CHECK NOTES:\n${JSON.stringify(fact)}\nDRAFT:\n${writerResult.text}`);
      finalDraft = extractJson(revision.text);
      await recordEditorialStage(run.id, 'writer-rework', 'bat-writer', { ...finalDraft }, sourceIds);
      fact = extractJson((await generateEditorial(`Return JSON with passed (boolean) and notes (string array). Check factual claims, quotations, numbers, dates, named events, and source attributions against the exact APPROVED SOURCES. Clearly signaled opinion, metaphor, satire, and editorial analysis are allowed.\nAPPROVED SOURCES:\n${evidence}\nREVISED DRAFT:\n${revision.text}`)).text);
      await recordEditorialStage(run.id, 'fact-check-rework', 'bat-fact-checker', { ...fact }, sourceIds);
    }
    if (fact.passed !== true) throw new Error('fact-check rejected the story after one revision');
    const queenResult = await generateEditorial(`Return JSON with title, dek, and body_markdown. Polish this fact-checked draft into a distinctive, concise personal-blogger post. Do not add claims or sources.\n${JSON.stringify(finalDraft)}`);
    const final = extractJson(queenResult.text);
    await recordEditorialStage(run.id, 'queen', 'bat-queen', { ...final }, sourceIds);
    await completeEditorialRun(run.id, 'completed');
    return { workflow: 'story', status: 'ready', runId: run.id, title: String(final.title ?? finalDraft.title ?? ''), dek: String(final.dek ?? finalDraft.dek ?? ''), body: String(final.body_markdown ?? finalDraft.body_markdown ?? ''), sourceIds, factCheck: { passed: true, notes: Array.isArray(fact.notes) ? fact.notes.map(String) : [] } };
  } catch (error) {
    await completeEditorialRun(run.id, 'failed', error instanceof Error ? error.message : 'story workflow failed');
    throw error;
  }
}

async function stagedWorkflow(input: unknown, workflow: string, stages: string[]): Promise<WorkflowResult> {
  const packet = await researchWorkflow(input);
  return { workflow, status: 'ready', researchPacketId: packet.id, stages };
}

export const storyWorkflow = editorialStoryWorkflow;
export const themeTakeWorkflow = (input: unknown) => stagedWorkflow(input, 'theme-take', ['research', 'analysis', 'writer', 'fact-check', 'queen']);
export const homepageWorkflow = (input: unknown) => stagedWorkflow(input, 'homepage', ['research', 'curation', 'layout']);
export const socialWorkflow = (input: unknown) => stagedWorkflow(input, 'social', ['source', 'social-editor', 'approval']);
export const fullEditorialCycleWorkflow = (input: unknown) => stagedWorkflow(input, 'full-editorial-cycle', ['research', 'analysis', 'story', 'theme-take', 'report', 'fact-check', 'queen', 'homepage', 'social']);
