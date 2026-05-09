import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const ThreadSchema = z.object({
  title: z.string().min(1).max(120),
  personaId: z.string().nullable().optional()
});

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("query")?.toLowerCase() ?? "";

  const threads = await prisma.chatThread.findMany({
    where: {
      userId: session.userId,
      ...(query
        ? {
            title: {
              contains: query
            }
          }
        : {})
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }]
  });

  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = ThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const thread = await prisma.chatThread.create({
    data: {
      userId: session.userId,
      title: parsed.data.title,
      personaId: parsed.data.personaId ?? null
    }
  });

  return NextResponse.json({ thread });
}
