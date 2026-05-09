import type { ModerationResult } from "@prisma/client";

const bannedWords = ["slur", "dox", "ssn", "credit card", "bitcoin giveaway"];

export type AutoModerationOutcome = {
  result: ModerationResult;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  notes?: string;
};

export function autoModerateText(text: string): AutoModerationOutcome {
  const lowered = text.toLowerCase();
  const categories: Record<string, boolean> = {
    spam: false,
    pii: false,
    violence: false
  };

  let score = 0;
  for (const word of bannedWords) {
    if (lowered.includes(word)) {
      categories.spam = true;
      score += 2;
    }
  }

  if (/(\b\d{3}-\d{2}-\d{4}\b)/.test(lowered)) {
    categories.pii = true;
    score += 3;
  }

  if (/(kill|blood|murder)/.test(lowered)) {
    categories.violence = true;
    score += 1;
  }

  if (score >= 4) {
    return { result: "BLOCK", categories, scores: { risk: score }, notes: "Auto-moderation blocked content" };
  }

  if (score >= 2) {
    return { result: "FLAG", categories, scores: { risk: score }, notes: "Auto-moderation flagged content" };
  }

  return { result: "PASS", categories, scores: { risk: score } };
}
