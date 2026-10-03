export type DJGatewayConfig = {
  requireCanonical: boolean;
  intelligenceUrl?: string;
  internalToken?: string;
  legacyUrl?: string;
  legacyApiKey?: string;
};

export type DJGatewayRoute =
  | { ok: true; baseUrl: string; token: string; source: "mastra" | "rassymind" }
  | { ok: false; reason: "canonical_url_missing" | "canonical_token_missing" | "legacy_url_missing" };

export function resolveDJGateway(config: DJGatewayConfig): DJGatewayRoute {
  const baseUrl = config.intelligenceUrl?.trim().replace(/\/$/, "");
  const legacyUrl = config.legacyUrl?.trim().replace(/\/$/, "");
  // Compose also points the compatibility URL at Mastra. Keep its internal
  // service credential paired with that endpoint even when the operator has
  // allowed explicit legacy routing for a different URL.
  if (config.requireCanonical || (baseUrl && legacyUrl && baseUrl === legacyUrl)) {
    if (!baseUrl) return { ok: false, reason: "canonical_url_missing" };
    const token = config.internalToken?.trim();
    if (!token) return { ok: false, reason: "canonical_token_missing" };
    return { ok: true, baseUrl, token, source: "mastra" };
  }

  if (!legacyUrl) return { ok: false, reason: "legacy_url_missing" };
  return { ok: true, baseUrl: legacyUrl, token: config.legacyApiKey?.trim() ?? "", source: "rassymind" };
}
