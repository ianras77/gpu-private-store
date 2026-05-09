import "server-only";

import { env } from "@/lib/env";
import type { WriterEngineProfile } from "@/lib/studio/writer-team";

export type CatProfileConfig = {
  key: WriterEngineProfile;
  label: string;
  httpBase: string;
  wsBase: string;
  dedicated: boolean;
};

const profilePrefix: Record<WriterEngineProfile, string> = {
  coach: "CAT_COACH",
  planner: "CAT_PLANNER",
  builder: "CAT_BUILDER",
  critic: "CAT_CRITIC"
};

function optionalValue(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function getCatProfileConfig(profile: WriterEngineProfile = "coach"): CatProfileConfig {
  const prefix = profilePrefix[profile];
  const httpBase = optionalValue(`${prefix}_HTTP_BASE`) ?? env.catHttpBase;
  const wsBase = optionalValue(`${prefix}_WS_BASE`) ?? env.catWsBase;
  const dedicated = httpBase !== env.catHttpBase || wsBase !== env.catWsBase;

  return {
    key: profile,
    label: dedicated ? `Dedicated ${profile} Cheshire Cat` : "Shared Launchpad Cheshire Cat",
    httpBase,
    wsBase,
    dedicated
  };
}
