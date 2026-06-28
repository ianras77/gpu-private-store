export type RuntimeEnv = Record<string, string | undefined>;

type DependencyHealth = {
  configured: boolean;
  target: string | null;
};

export type HealthReport = {
  ok: boolean;
  app: "rassy-online";
  stage: "stage-5-magical-ux";
  publicBaseUrl: string | null;
  uploadRoot: string | null;
  dependencies: {
    rassycodex: DependencyHealth;
    database: DependencyHealth;
    qdrant: DependencyHealth;
  };
  missing: string[];
};

const REQUIRED_ENV = [
  "RASSY_ONLINE_PUBLIC_BASE_URL",
  "RASSYCODEX_BASE_URL",
  "DATABASE_URL",
  "QDRANT_URL",
  "RASSY_ONLINE_UPLOAD_ROOT"
] as const;

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dependency(target: string | undefined): DependencyHealth {
  return {
    configured: present(target),
    target: present(target) ? redactUrlSecret(target) : null
  };
}

function redactUrlSecret(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function buildHealthReport(env: RuntimeEnv): HealthReport {
  const missing = REQUIRED_ENV.filter((key) => !present(env[key]));

  return {
    ok: missing.length === 0,
    app: "rassy-online",
    stage: "stage-5-magical-ux",
    publicBaseUrl: present(env.RASSY_ONLINE_PUBLIC_BASE_URL) ? env.RASSY_ONLINE_PUBLIC_BASE_URL : null,
    uploadRoot: present(env.RASSY_ONLINE_UPLOAD_ROOT) ? env.RASSY_ONLINE_UPLOAD_ROOT : null,
    dependencies: {
      rassycodex: dependency(env.RASSYCODEX_BASE_URL),
      database: dependency(env.DATABASE_URL),
      qdrant: dependency(env.QDRANT_URL)
    },
    missing
  };
}
