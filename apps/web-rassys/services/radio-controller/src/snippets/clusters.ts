type SnippetBumperClusterOptions = {
  hasPrimarySnippet: boolean;
  allowRandomFallback: boolean;
  snippetChance: number;
  clusterChance: number;
  maxCluster: number;
  random?: () => number;
};

const clampChance = (value: number) => Math.max(0, Math.min(1, value));

export const planSnippetBumperCluster = (options: SnippetBumperClusterOptions) => {
  const maxCluster = Math.max(1, Math.floor(options.maxCluster));
  const random = () => clampChance(options.random?.() ?? Math.random());
  const shouldStart =
    options.hasPrimarySnippet ||
    (options.allowRandomFallback && random() < clampChance(options.snippetChance));

  if (!shouldStart) return 0;

  let count = 1;
  const clusterChance = clampChance(options.clusterChance);
  while (count < maxCluster && random() < clusterChance) {
    count += 1;
  }

  return count;
};
