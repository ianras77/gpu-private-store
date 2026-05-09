import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const PersonaSchema = z.object({
  name: z.string().min(1).max(60),
  systemPrompt: z.string().min(1).max(2000)
});

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personas = await prisma.persona.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ personas });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = PersonaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const persona = await prisma.persona.create({
    data: {
      userId: session.userId,
      name: parsed.data.name,
      systemPrompt: parsed.data.systemPrompt
    }
  });

  return NextResponse.json({ persona });
}
