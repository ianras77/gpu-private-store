import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const MessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1)
});

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await prisma.message.findMany({
    where: { threadId: context.params.id, thread: { userId: session.userId } },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: context.params.id, userId: session.userId }
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      threadId: context.params.id,
      role: parsed.data.role,
      content: parsed.data.content
    }
  });

  return NextResponse.json({ message });
}
