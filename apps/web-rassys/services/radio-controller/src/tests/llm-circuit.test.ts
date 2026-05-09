import { describe, expect, it } from "vitest";
import { createLlmCircuitRegistry } from "../dj/llm-circuit";

describe("createLlmCircuitRegistry", () => {
  it("opens the circuit after repeated failures", () => {
    const circuit = createLlmCircuitRegistry({
      failureThreshold: 3,
      cooldownMs: 60_000
    });

    expect(circuit.shouldSkip("playlist", 1_000)).toBe(false);
    expect(circuit.noteFailure("playlist", 1_000).opened).toBe(false);
    expect(circuit.noteFailure("playlist", 2_000).opened).toBe(false);
    expect(circuit.noteFailure("playlist", 3_000).opened).toBe(true);
    expect(circuit.shouldSkip("playlist", 3_100)).toBe(true);
  });

  it("resets after a success", () => {
    const circuit = createLlmCircuitRegistry({
      failureThreshold: 2,
      cooldownMs: 60_000
    });

    circuit.noteFailure("playlist", 1_000);
    circuit.noteSuccess("playlist");

    expect(circuit.snapshot("playlist", 2_000)).toEqual({
      failures: 0,
      lastFailureAt: 0,
      openedUntil: 0
    });
    expect(circuit.shouldSkip("playlist", 2_000)).toBe(false);
  });

  it("reopens to a clean slate after cooldown expires", () => {
    const circuit = createLlmCircuitRegistry({
      failureThreshold: 2,
      cooldownMs: 5_000
    });

    circuit.noteFailure("playlist", 1_000);
    circuit.noteFailure("playlist", 2_000);

    expect(circuit.shouldSkip("playlist", 3_000)).toBe(true);
    expect(circuit.shouldSkip("playlist", 8_100)).toBe(false);
    expect(circuit.snapshot("playlist", 8_100)).toEqual({
      failures: 0,
      lastFailureAt: 0,
      openedUntil: 0
    });
  });
});

