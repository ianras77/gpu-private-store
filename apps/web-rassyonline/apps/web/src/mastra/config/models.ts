export const RASSYMIND_LANES = {
  mind: "rassy-mind",
  code: "rassy-code",
  fast: "rassy-fast",
  utility: "rassy-utility",
  embed: "rassy-embed",
  rerank: "rassy-rerank"
} as const;

export type RassyMindLane = (typeof RASSYMIND_LANES)[keyof typeof RASSYMIND_LANES];

export const MODEL_CAPABILITIES = {
  "rassy-mind": { supportsTools: true, supportsReasoning: true },
  "rassy-code": { supportsTools: false, supportsReasoning: true },
  "rassy-fast": { supportsTools: false, supportsReasoning: false },
  "rassy-utility": { supportsTools: false, supportsReasoning: false }
} as const;
