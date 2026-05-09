import type { SafetyFlag } from './types';

const RED_FLAG_PHRASES = [
  'i will hurt',
  'i want to hurt',
  'i am going to hurt',
  'they will hurt me',
  'they are going to hurt me',
  'im not safe',
  "i'm not safe",
  'kill myself',
  'end my life',
  'suicide',
  'stalk',
  'stalking',
  'harass',
  'harassment',
  'coercion',
  'coercive',
  'control me',
  'violence',
  'threat',
  'threaten'
];

export function detectSafetyFlag(text: string): SafetyFlag {
  const normalized = text.toLowerCase();
  const match = RED_FLAG_PHRASES.find((phrase) => normalized.includes(phrase));
  if (match) {
    return { flagged: true, reason: `Matched phrase: ${match}` };
  }
  return { flagged: false };
}
