import { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken, writeAuditEvent } from "@/lib/auth/users";
import { deleteDocumentForUser, setDocumentActive } from "@/lib/documents";
import { deleteDocumentVectors } from "@/lib/qdrant";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  active: z.boolean()
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.parse(await request.json());
  const document = await setDocumentActive(user.id, id, parsed.active);
  await writeAuditEvent(user.id, "document.toggle", id, { active: parsed.active });
  return json({ ok: true, document });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await context.params;
  const deleted = await deleteDocumentForUser(user.id, id);
  if (!deleted) return json({ ok: false, error: "document_not_found" }, { status: 404 });
  await deleteDocumentVectors(user.id, id);
  await writeAuditEvent(user.id, "document.delete", id, {});
  return json({ ok: true });
}
