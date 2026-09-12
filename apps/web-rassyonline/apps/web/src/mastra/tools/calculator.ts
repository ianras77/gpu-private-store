import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function calculate(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("only arithmetic expressions are allowed");
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === "(") { const value = additive(); if (tokens[index++] !== ")") throw new Error("unmatched parenthesis"); return value; }
    if (token === "-") return -primary();
    if (!token || Number.isNaN(Number(token))) throw new Error("invalid expression");
    return Number(token);
  };
  const multiplicative = (): number => { let value = primary(); while (["*", "/", "%"].includes(tokens[index])) { const op = tokens[index++]; const right = primary(); if (op === "*") value *= right; else if (op === "/") value /= right; else value %= right; } return value; };
  const additive = (): number => { let value = multiplicative(); while (["+", "-"].includes(tokens[index])) { const op = tokens[index++]; const right = multiplicative(); value = op === "+" ? value + right : value - right; } return value; };
  const result = additive();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("invalid arithmetic result");
  return result;
}

export const calculatorTool = createTool({
  id: "calculator",
  description: "Evaluate safe basic arithmetic. Use this instead of mental arithmetic.",
  inputSchema: z.object({ expression: z.string().trim().min(1).max(200) }),
  outputSchema: z.object({ status: z.enum(["ok", "failed"]), expression: z.string(), result: z.number().optional(), error: z.string().optional() }),
  execute: async ({ expression }) => { try { return { status: "ok" as const, expression, result: calculate(expression) }; } catch (error) { return { status: "failed" as const, expression, error: error instanceof Error ? error.message : "calculation failed" }; } }
});
