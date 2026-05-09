import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { APPROVED_CODE_PACKAGES, CURATED_ASSET_PACKS } from "@/lib/studio/assets";
import { getStudioSummary } from "@/lib/studio/data";
import { MAP_PATTERNS, WORLD_PROFILES } from "@/lib/studio/worlds";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const summary = await getStudioSummary(workspace.id, session.userId);
  const templateSlug = summary.templatePack?.slug ?? null;
  const recipeRecommended = summary.worldRecipe?.recommendedAssetPackSlugs ?? [];
  const recommendedPacks = recipeRecommended.length
    ? CURATED_ASSET_PACKS.filter((pack) => recipeRecommended.includes(pack.slug))
    : templateSlug
      ? CURATED_ASSET_PACKS.filter((pack) => pack.recommendedTemplateSlugs.includes(templateSlug))
      : CURATED_ASSET_PACKS;

  return NextResponse.json({
    catalog: {
      packs: CURATED_ASSET_PACKS,
      codePackages: APPROVED_CODE_PACKAGES,
      worldProfiles: WORLD_PROFILES,
      mapPatterns: MAP_PATTERNS,
      recommendedPacks
    },
    selection: {
      selectedPackSlugs: summary.selectedAssetPackSlugs,
      selectedAssetItems: summary.selectedAssetItems,
      approvedCodePackages: summary.approvedCodePackages,
      worldProfile: summary.worldProfile,
      mapPattern: summary.mapPattern,
      worldRecipe: summary.worldRecipe
    }
  });
}
