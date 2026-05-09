import { NextResponse } from "next/server";
import { listDmSystems } from "../../../../lib/dm/service";

export const runtime = "nodejs";

const fallbackSystems = [
  {
    id: "gamma-world",
    displayName: "Gamma World",
    description: "Post-apocalyptic science-fantasy with mutations, salvage tech, and faction conflict.",
    rulesPrimer: "Gamma World emphasizes consequences, unstable technology, and evolving world state."
  },
  {
    id: "generic",
    displayName: "Generic RPG",
    description: "System-agnostic fallback for narrative RPG sessions.",
    rulesPrimer: "Maintain continuity, bounded state changes, and explicit consequences."
  }
];

export async function GET() {
  try {
    const systems = await listDmSystems();
    return NextResponse.json({ systems, total: systems.length, fallback: false });
  } catch (error) {
    console.error("dm_system_list_failed", error);
    return NextResponse.json(
      {
        systems: fallbackSystems,
        total: fallbackSystems.length,
        fallback: true,
        error: "system_list_fallback"
      },
      { status: 200 }
    );
  }
}
