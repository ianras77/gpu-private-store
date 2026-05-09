import { NextResponse } from "next/server";
import { searchCompendiumEntries } from "../../../../../../lib/dm/service";

type Params = { params: Promise<{ systemId: string }> };

export const runtime = "nodejs";

const parseLimit = (value: string | null) => {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
};

export async function GET(request: Request, context: Params) {
  try {
    const { systemId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? undefined;
    const limit = parseLimit(searchParams.get("limit"));
    const typesParam = searchParams.get("types");
    const entryTypes = typesParam
      ? typesParam
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : undefined;

    const items = await searchCompendiumEntries({
      systemId,
      query,
      entryTypes,
      limit
    });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error("dm_compendium_lookup_failed", error);
    return NextResponse.json({ items: [], total: 0, error: "compendium_lookup_failed" }, { status: 500 });
  }
}
