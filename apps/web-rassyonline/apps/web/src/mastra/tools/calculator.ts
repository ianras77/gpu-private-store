import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const FUNCTIONS: Record<string, (value: number) => number> = {
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log,
  log10: Math.log10, exp: Math.exp
};

export function calculate(expression: string): number {
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/%^]/gi);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("invalid calculator expression");
  let index = 0;
  const peek = () => tokens[index];
  const primary = (): number => {
    const token = tokens[index++];
    if (token === "(") { const value = additive(); if (tokens[index++] !== ")") throw new Error("unmatched parenthesis"); return value; }
    if (token === "-") return -primary();
    if (token === "+") return primary();
    if (!token) throw new Error("invalid expression");
    if (token.toLowerCase() === "pi") return Math.PI;
    if (token.toLowerCase() === "e") return Math.E;
    if (FUNCTIONS[token.toLowerCase()]) {
      if (tokens[index++] !== "(") throw new Error("function requires parentheses");
      const value = additive(); if (tokens[index++] !== ")") throw new Error("unmatched parenthesis");
      return FUNCTIONS[token.toLowerCase()](value);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("invalid expression");
    return value;
  };
  const power = (): number => { let value = primary(); if (peek() === "^") { index++; value = value ** power(); } return value; };
  const multiplicative = (): number => { let value = power(); while (["*", "/", "%"].includes(peek())) { const op = tokens[index++]; const right = power(); if (op === "*") value *= right; else if (op === "/") value /= right; else value %= right; } return value; };
  const additive = (): number => { let value = multiplicative(); while (["+", "-"].includes(peek())) { const op = tokens[index++]; const right = multiplicative(); value = op === "+" ? value + right : value - right; } return value; };
  const result = additive();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("invalid arithmetic result");
  return result;
}

export const calculatorTool = createTool({
  id: "calculator",
  description: "Evaluate safe numeric expressions. Supports +, -, *, /, %, ^, parentheses, constants pi/e, and functions sqrt, abs, round, floor, ceil, sin, cos, tan, asin, acos, atan, ln, log10, and exp. Use for every non-trivial calculation; never invent a result.",
  inputSchema: z.object({ expression: z.string().trim().min(1).max(200) }),
  outputSchema: z.object({ status: z.enum(["ok", "failed"]), expression: z.string(), result: z.number().optional(), error: z.string().optional() }),
  execute: async ({ expression }) => { try { return { status: "ok" as const, expression, result: calculate(expression) }; } catch (error) { return { status: "failed" as const, expression, error: error instanceof Error ? error.message : "calculation failed" }; } }
});
