export type FactCheck = { passed: boolean; notes: string[] };

export function parseFactCheck(value: Record<string, unknown>): FactCheck {
  if (typeof value.passed !== 'boolean') throw new Error('fact-check returned no boolean pass/fail result');
  const notes = Array.isArray(value.notes) ? value.notes.filter((note): note is string => typeof note === 'string').map(note => note.trim()).filter(Boolean) : [];
  if (!value.passed && !notes.length) throw new Error('fact-check rejected the draft without actionable notes');
  return { passed: value.passed, notes };
}
