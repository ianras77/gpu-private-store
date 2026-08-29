type CharacterRecord = { hpCurrent: number; hpMax: number; status: string };
type EventRecord = { summary: string; createdAt: string };
type CampaignSnapshot = { characters: CharacterRecord[]; events: EventRecord[] };

export type CharacterCondition = "steady" | "shaken" | "wounded" | "critical";

export const getCharacterCondition = (character: CharacterRecord): CharacterCondition => {
  if (character.hpCurrent <= 0) return "critical";
  const ratio = character.hpMax > 0 ? character.hpCurrent / character.hpMax : 0;
  if (ratio <= 0.25 || /critical|unconscious|dying/i.test(character.status)) return "critical";
  if (ratio <= 0.55 || /wound|hurt|injur|sick|radiat/i.test(character.status)) return "wounded";
  if (/shak|fear|stun|confus|exhaust/i.test(character.status)) return "shaken";
  return "steady";
};

export const getConditionLabel = (character: CharacterRecord) => {
  const condition = getCharacterCondition(character);
  return { steady: "Holding steady", shaken: "Shaken", wounded: "Wounded", critical: "Critical" }[condition];
};

export const getCharacterSignal = (character: CharacterRecord) => {
  const condition = getCharacterCondition(character);
  return {
    steady: { color: "cyan", message: "Ready for the next move" },
    shaken: { color: "yellow", message: "Needs a moment or an ally" },
    wounded: { color: "pink", message: "Hurt, but still in the fight" },
    critical: { color: "red", message: "Needs immediate care" }
  }[condition];
};

export const getPartyPressure = (snapshot: CampaignSnapshot) => {
  const critical = snapshot.characters.filter((character) => getCharacterCondition(character) === "critical").length;
  const wounded = snapshot.characters.filter((character) => getCharacterCondition(character) === "wounded").length;
  if (critical) return `${critical} character${critical === 1 ? " is" : "s are"} in critical condition`;
  if (wounded) return `${wounded} character${wounded === 1 ? " is" : "s are"} carrying injuries`;
  return "The party is ready for trouble";
};

export const getLatestChange = (events: EventRecord[]) => {
  const event = events.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return event?.summary ?? "The world is waiting for the party's next decision.";
};
