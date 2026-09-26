import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFactCheck } from './fact-check.js';

test('fact checks preserve actionable rejection notes', () => {
  assert.deepEqual(parseFactCheck({ passed: false, notes: ['Remove the unsupported date.'] }), {
    passed: false,
    notes: ['Remove the unsupported date.'],
  });
});

test('fact checks fail closed when a rejection has no repair instruction', () => {
  assert.throws(() => parseFactCheck({ passed: false }), /without actionable notes/);
});

test('fact checks require an explicit boolean decision', () => {
  assert.throws(() => parseFactCheck({ notes: [] }), /no boolean pass\/fail/);
});
