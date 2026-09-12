import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const chartTool = createTool({
  id: "chart",
  description: "Build a basic chart from supplied data. Use for bar, line, scatter, or pie charts. Return the structured chart artifact and explain the data; never invent missing values.",
  inputSchema: z.object({
    type: z.enum(["bar", "line", "scatter", "pie"]),
    title: z.string().max(160).default("Chart"),
    x_label: z.string().max(80).optional(), y_label: z.string().max(80).optional(),
    labels: z.array(z.string().max(100)).min(1).max(100),
    values: z.array(z.number().finite()).min(1).max(100),
    series: z.string().max(100).default("Value")
  }).superRefine((input, ctx) => { if (input.labels.length !== input.values.length) ctx.addIssue({ code: "custom", message: "labels and values must have equal length", path: ["values"] }); }),
  outputSchema: z.object({ kind: z.literal("chart"), type: z.string(), title: z.string(), labels: z.array(z.string()), values: z.array(z.number()), series: z.string(), x_label: z.string().optional(), y_label: z.string().optional() }),
  execute: async (input) => ({ kind: "chart" as const, ...input })
});
