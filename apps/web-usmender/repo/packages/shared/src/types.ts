export type SafetyFlag = {
  flagged: boolean;
  reason?: string | undefined;
};

export type VoteValue = 'YES' | 'NO' | 'NEEDS_CHANGES';
