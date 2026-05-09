import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const PatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  systemPrompt: z.string().min(1).max(2000).optional()
});

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.persona.findFirst({
    where: { id: context.params.id, userId: session.userId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const persona = await prisma.persona.update({
    where: { id: existing.id },
    data: parsed.data
  });

  return NextResponse.json({ persona });
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.persona.deleteMany({
    where: { id: context.params.id, userId: session.userId }
  });

  return NextResponse.json({ ok: true });
}
