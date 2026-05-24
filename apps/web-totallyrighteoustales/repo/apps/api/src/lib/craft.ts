export type CraftNotesInput = {
  title?: string | null;
  body?: string | null;
  premise?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
};

function wordCount(text?: string | null) {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function hasValue(text?: string | null) {
  return Boolean(text && text.trim().length > 0);
}

export function chooseCraftFocus(input: CraftNotesInput) {
  if (!hasValue(input.stakes) || !hasValue(input.turn)) return "structure";
  if (!hasValue(input.voice)) return "voice";
  if (wordCount(input.body) < 350) return "stakes";
  return "line-edit";
}

export function buildCraftNotesFallback(input: CraftNotesInput) {
  const notes: string[] = [];
  const words = wordCount(input.body);

  if (!hasValue(input.premise)) {
    notes.push(
      "Name the promise of the tale in one sentence before drafting further.",
    );
  } else {
    notes.push(
      "Make the opening image prove the premise quickly, then let the narrator make one clear choice.",
    );
  }

  if (!hasValue(input.character)) {
    notes.push(
      "Give the tale one person with a want, a private habit, and a reason to keep going.",
    );
  } else {
    notes.push(
      "Let the main character reveal themselves through action before explanation.",
    );
  }

  if (!hasValue(input.stakes) || !hasValue(input.turn)) {
    notes.push(
      "Add a turn where something costs more than expected; wonder works best when it changes the bargain.",
    );
  } else {
    notes.push(
      "Make the middle turn force a choice instead of only adding more atmosphere.",
    );
  }

  if (words < 350) {
    notes.push(
      "Stay with two more scenes before submitting: one complication, one consequence, then the final aftertaste.",
    );
  } else {
    notes.push(
      "Read the last paragraph aloud and remove any sentence that explains what the scene already made clear.",
    );
  }

  return notes;
}
