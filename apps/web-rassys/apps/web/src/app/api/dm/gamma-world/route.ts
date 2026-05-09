import { NextResponse } from "next/server";
import { searchCompendiumEntries } from "../../../../lib/dm/service";

export const runtime = "nodejs";

type LookupItem = {
  id: string;
  type: "weapon" | "event" | "character";
  title: string;
  subtitle?: string;
  section?: string;
};

const parseLimit = (value: string | null) => {
  if (!value) return 12;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(Math.max(parsed, 1), 50);
};

const typeToEntryTypes = (type: string | null): string[] | undefined => {
  if (!type) return undefined;
  if (type === "weapon") return ["weapon"];
  if (type === "event") return ["event"];
  if (type === "character") return ["character", "archetype_template"];
  return undefined;
};

const mapItemType = (entryType: string): LookupItem["type"] => {
  if (entryType === "weapon") return "weapon";
  if (entryType === "event") return "event";
  return "character";
};

const excerpt = (value: string, limit: number) => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit).replace(/[,:;.\s]+$/, "")}…`;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? undefined;
    const limit = parseLimit(searchParams.get("limit"));
    const requestedType = searchParams.get("type");
    const items = await searchCompendiumEntries({
      systemId: "gamma-world",
      query,
      entryTypes: typeToEntryTypes(requestedType),
      limit
    });

    const mapped: LookupItem[] = items.map((item) => ({
      id: item.id,
      type: mapItemType(item.entryType),
      title: item.name,
      subtitle: item.summary ? excerpt(item.summary, 160) : undefined,
      section:
        (typeof item.data.section === "string" ? item.data.section : undefined) ??
        item.tags.find((entry) => entry.length > 0)
    }));

    return NextResponse.json({ items: mapped, total: mapped.length });
  } catch (error) {
    console.error("Gamma World rules lookup failed", error);
    return NextResponse.json(
      { items: [], total: 0, error: "Gamma World lookup unavailable." },
      { status: 500 }
    );
  }
}
