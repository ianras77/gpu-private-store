import test from 'node:test';
import assert from 'node:assert/strict';
import { reportArtifact } from './report.js';

test('report artifacts require source-backed chapters and fact-check metadata', () => {
  const result = reportArtifact.safeParse({
    schemaVersion: '1', id: 'run-1', kind: 'theme-dossier', title: 'Test report',
    executiveSummary: 'Summary', keyFindings: ['Finding'],
    chapters: [{ id: 'chapter-1', title: 'Evidence', thesis: 'Thesis', bodyMarkdown: 'Body', sourceIds: ['source-1'] }],
    sourceIds: ['source-1'], sourceNotes: [{ sourceId: 'source-1', title: 'Receipt', url: 'https://example.com/receipt' }],
    generatedAt: new Date().toISOString(), runId: 'run-1', factCheck: { passed: true, confidence: 1, requiredFixes: [] },
  });
  assert.equal(result.success, true);
});

test('report artifacts reject invented or malformed source URLs', () => {
  const result = reportArtifact.safeParse({
    schemaVersion: '1', id: 'run-1', kind: 'theme-dossier', title: 'Test report', executiveSummary: 'Summary', keyFindings: [],
    chapters: [], sourceIds: [], sourceNotes: [{ sourceId: 'x', title: 'Bad', url: 'not-a-url' }], generatedAt: 'now', runId: 'run-1',
    factCheck: { passed: false, confidence: 0, requiredFixes: ['source'] },
  });
  assert.equal(result.success, false);
});
