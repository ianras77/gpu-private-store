type LlmCircuitOptions = {
  failureThreshold: number;
  cooldownMs: number;
  failureWindowMs?: number;
};

type LlmCircuitState = {
  failures: number;
  lastFailureAt: number;
  openedUntil: number;
};

const freshState = (): LlmCircuitState => ({
  failures: 0,
  lastFailureAt: 0,
  openedUntil: 0
});

export const createLlmCircuitRegistry = (options: LlmCircuitOptions) => {
  const failureThreshold = Math.max(1, options.failureThreshold);
  const cooldownMs = Math.max(1000, options.cooldownMs);
  const failureWindowMs = Math.max(cooldownMs, options.failureWindowMs ?? cooldownMs);
  const states = new Map<string, LlmCircuitState>();

  const getState = (label: string, now: number) => {
    const current = states.get(label) ?? freshState();
    if (current.openedUntil > 0 && current.openedUntil <= now) {
      const reset = freshState();
      states.set(label, reset);
      return reset;
    }
    if (current.lastFailureAt > 0 && now - current.lastFailureAt > failureWindowMs) {
      const reset = freshState();
      states.set(label, reset);
      return reset;
    }
    return current;
  };

  return {
    shouldSkip(label: string, now = Date.now()) {
      return getState(label, now).openedUntil > now;
    },
    noteSuccess(label: string) {
      states.delete(label);
    },
    noteFailure(label: string, now = Date.now()) {
      const current = getState(label, now);
      const failures = current.failures + 1;
      const next: LlmCircuitState = {
        failures,
        lastFailureAt: now,
        openedUntil: failures >= failureThreshold ? now + cooldownMs : 0
      };
      states.set(label, next);
      return {
        opened: next.openedUntil > now,
        failures: next.failures,
        openedUntil: next.openedUntil
      };
    },
    snapshot(label: string, now = Date.now()) {
      return getState(label, now);
    }
  };
};

