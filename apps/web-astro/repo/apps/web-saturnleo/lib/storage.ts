const CURRENT_KEY = "astro_chart_current";
const LIBRARY_KEY = "astro_chart_library";
const LEGACY_SESSION_KEY = "chart_json";
const AUTH_SESSION_KEY = "astro_auth_session";

type StoredAuthSession = {
  token: string;
  expiresAt?: string;
  user: {
    id: string;
    email: string;
    displayName?: string | null;
  };
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chart_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
};

const readJson = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const readSessionJson = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore write errors (quota or disabled storage)
  }
};

const removeItem = (key: string) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore disabled storage errors
  }
};

const withMeta = (chart: any) => {
  if (!chart || typeof chart !== "object") {
    return { id: generateId(), savedAt: new Date().toISOString() };
  }

  return {
    ...chart,
    id: chart.id ?? generateId(),
    savedAt: chart.savedAt ?? new Date().toISOString()
  };
};

const writeChartState = (nextChart: any) => {
  const next = withMeta(nextChart);
  const libraryRaw = readJson(LIBRARY_KEY);
  const library = Array.isArray(libraryRaw) ? libraryRaw : [];
  const updated = [next, ...library.filter((item) => item?.id !== next.id)];
  writeJson(LIBRARY_KEY, updated);
  writeJson(CURRENT_KEY, next);
  return next;
};

export const storeChart = (chart: unknown) => {
  if (typeof window === "undefined") return;
  writeChartState(chart as any);
};

export const loadChart = (): any | null => {
  if (typeof window === "undefined") return null;
  const current = readJson(CURRENT_KEY);
  if (current) return current;
  const libraryRaw = readJson(LIBRARY_KEY);
  const library = Array.isArray(libraryRaw) ? libraryRaw : [];
  if (library[0]) return library[0];

  const legacy = readSessionJson(LEGACY_SESSION_KEY);
  if (legacy) {
    const migrated = withMeta(legacy);
    writeJson(LIBRARY_KEY, [migrated]);
    writeJson(CURRENT_KEY, migrated);
    return migrated;
  }

  return null;
};

export const loadCharts = (): any[] => {
  if (typeof window === "undefined") return [];
  const libraryRaw = readJson(LIBRARY_KEY);
  return Array.isArray(libraryRaw) ? libraryRaw : [];
};

export const linkCurrentChartProfile = (chartProfile: {
  id: string;
  label?: string | null;
  isPrimary?: boolean;
  autoWeekly?: boolean;
}) => {
  const current = loadChart();
  if (!current) return null;

  return writeChartState({
    ...current,
    chartProfileId: chartProfile.id,
    chartProfileLabel: chartProfile.label ?? current.chartProfileLabel ?? null,
    chartProfileIsPrimary: chartProfile.isPrimary ?? current.chartProfileIsPrimary ?? false,
    chartProfileAutoWeekly: chartProfile.autoWeekly ?? current.chartProfileAutoWeekly ?? true
  });
};

export const unlinkCurrentChartProfile = (chartProfileId: string) => {
  const current = loadChart();
  if (!current || current.chartProfileId !== chartProfileId) return current;

  return writeChartState({
    ...current,
    chartProfileId: undefined,
    chartProfileLabel: undefined,
    chartProfileIsPrimary: undefined,
    chartProfileAutoWeekly: undefined
  });
};

export const storeAuthSession = (session: StoredAuthSession) => {
  writeJson(AUTH_SESSION_KEY, session);
};

export const loadAuthSession = (): StoredAuthSession | null => {
  const session = readJson(AUTH_SESSION_KEY);
  if (!session || typeof session !== "object" || typeof session.token !== "string") return null;
  return session as StoredAuthSession;
};

export const loadAuthToken = (): string | null => {
  return loadAuthSession()?.token ?? null;
};

export const clearAuthSession = () => {
  removeItem(AUTH_SESSION_KEY);
};
