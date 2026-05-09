import "server-only";

import { CatClient } from "ccat-api";
import { env } from "@/lib/env";
import { CatHttpError } from "@/lib/cat/errors";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

type FetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  token?: string | null;
  useApiKey?: boolean;
  httpBase?: string | null;
  userId?: string | null;
  appUserId?: string | null;
  workspaceId?: string | null;
  workspaceRole?: string | null;
};

type CatClientOptions = {
  token?: string | null;
  userId?: string | null;
  instant?: boolean;
  timeoutMs?: number;
  base?: "http" | "ws";
  httpBase?: string | null;
  wsBase?: string | null;
};

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, cleanup: () => clearTimeout(id) };
}

export function buildHttpUrl(path: string, baseUrl = env.catHttpBase) {
  return new URL(path, baseUrl).toString();
}

function getCatEndpoint(baseUrl: string) {
  const base = new URL(baseUrl);
  const secure = base.protocol === "https:" || base.protocol === "wss:";
  const port = base.port ? Number(base.port) : secure ? 443 : 80;
  return { host: base.hostname, port, secure };
}

export function createCatClient(options: CatClientOptions = {}) {
  const baseUrl =
    options.base === "ws" ? options.wsBase ?? env.catWsBase : options.httpBase ?? env.catHttpBase;
  const { host, port, secure } = getCatEndpoint(baseUrl);
  const credential = options.token ?? env.catHttpApiKey ?? env.catWsApiKey ?? undefined;
  const userId = options.userId ?? undefined;

  return new CatClient({
    host,
    port,
    secure,
    userId,
    credential,
    instant: options.instant ?? false,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });
}

export async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let workspaceId = options.workspaceId ?? null;
  let workspaceRole = options.workspaceRole ?? null;

  if ((!workspaceId || !workspaceRole) && options.appUserId) {
    const workspaceContext = await getOrCreateWorkspace(options.appUserId);
    workspaceId = workspaceId ?? workspaceContext.workspace.id;
    workspaceRole = workspaceRole ?? workspaceContext.member.role;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { controller, cleanup } = withTimeout(timeoutMs);
    try {
      const headers = new Headers(options.headers);
      headers.set("Content-Type", "application/json");

      if (options.userId) {
        headers.set("user_id", options.userId);
      }

      if (workspaceId) {
        headers.set("x-console-workspace-id", workspaceId);
      }

      if (workspaceRole) {
        headers.set("x-console-workspace-role", workspaceRole);
      }

      if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
      } else if (options.useApiKey && env.catHttpApiKey) {
        headers.set("Authorization", `Bearer ${env.catHttpApiKey}`);
      }

      const response = await fetch(buildHttpUrl(path, options.httpBase ?? env.catHttpBase), {
        ...options,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new CatHttpError(response.status, errorBody);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      cleanup();
    }
  }

  throw lastError;
}

export async function fetchForm<T>(
  path: string,
  formData: FormData,
  options: FetchOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let workspaceId = options.workspaceId ?? null;
  let workspaceRole = options.workspaceRole ?? null;

  if ((!workspaceId || !workspaceRole) && options.appUserId) {
    const workspaceContext = await getOrCreateWorkspace(options.appUserId);
    workspaceId = workspaceId ?? workspaceContext.workspace.id;
    workspaceRole = workspaceRole ?? workspaceContext.member.role;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { controller, cleanup } = withTimeout(timeoutMs);
    try {
      const headers = new Headers(options.headers);

      if (options.userId) {
        headers.set("user_id", options.userId);
      }

      if (workspaceId) {
        headers.set("x-console-workspace-id", workspaceId);
      }

      if (workspaceRole) {
        headers.set("x-console-workspace-role", workspaceRole);
      }

      if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
      } else if (options.useApiKey && env.catHttpApiKey) {
        headers.set("Authorization", `Bearer ${env.catHttpApiKey}`);
      }

      const response = await fetch(buildHttpUrl(path, options.httpBase ?? env.catHttpBase), {
        ...options,
        method: options.method ?? "POST",
        headers,
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new CatHttpError(response.status, errorBody);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      cleanup();
    }
  }

  throw lastError;
}
