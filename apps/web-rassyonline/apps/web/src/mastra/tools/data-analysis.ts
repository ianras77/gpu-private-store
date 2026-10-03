import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type AnalysisMode = "describe" | "normalize" | "cumulative" | "moving-average" | "percent-change";

function rounded(value: number): number { return Number(value.toPrecision(10)); }

export function analyzeSeries(values: number[], mode: AnalysisMode, window = 3) {
  if (!values.length) throw new Error("series must contain at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const minimum = sorted[0]; const maximum = sorted.at(-1)!;
  const transformed = mode === "normalize"
    ? values.map((value) => maximum === minimum ? 0 : rounded((value - minimum) / (maximum - minimum)))
    : mode === "cumulative"
      ? values.reduce<number[]>((result, value) => [...result, rounded((result.at(-1) ?? 0) + value)], [])
      : mode === "moving-average"
        ? values.map((_, index) => { const subset = values.slice(Math.max(0, index - window + 1), index + 1); return rounded(subset.reduce((sum, value) => sum + value, 0) / subset.length); })
        : mode === "percent-change"
          ? values.map((value, index) => index === 0 ? 0 : values[index - 1] === 0 ? 0 : rounded((value - values[index - 1]) / Math.abs(values[index - 1]) * 100))
          : values;
  return { values: transformed, summary: { count: values.length, minimum: rounded(minimum), maximum: rounded(maximum), mean: rounded(mean), median: rounded(median), standardDeviation: rounded(Math.sqrt(variance)), sum: rounded(values.reduce((sum, value) => sum + value, 0)) } };
}

export const dataAnalysisTool = createTool({
  id: "data-analysis",
  description: "Analyze or transform a supplied numeric series so its output can be passed directly to chart. Modes: describe returns verified summary statistics; normalize rescales values to 0..1; cumulative produces running totals; moving-average smooths with a trailing window; percent-change gives sequential percentage change (first point is 0). Use only supplied values and preserve labels exactly.",
  inputSchema: z.object({ mode: z.enum(["describe", "normalize", "cumulative", "moving-average", "percent-change"]).default("describe"), labels: z.array(z.string().trim().min(1).max(100)).min(1).max(100), values: z.array(z.number().finite()).min(1).max(100), window: z.number().int().min(2).max(20).default(3) }).superRefine((input, ctx) => { if (input.labels.length !== input.values.length) ctx.addIssue({ code: "custom", path: ["values"], message: "labels and values must have equal length" }); }),
  outputSchema: z.object({ kind: z.literal("data-analysis"), mode: z.string(), labels: z.array(z.string()), values: z.array(z.number()), summary: z.object({ count: z.number(), minimum: z.number(), maximum: z.number(), mean: z.number(), median: z.number(), standardDeviation: z.number(), sum: z.number() }) }),
  execute: async ({ mode, labels, values, window }) => ({ kind: "data-analysis" as const, mode, labels, ...analyzeSeries(values, mode, window) })
});
