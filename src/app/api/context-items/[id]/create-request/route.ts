import { withApi } from "@/lib/observability";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireContextItemApiAccess } from "@/lib/access/documentAccess";
import { db, establishAuthContext } from "@/lib/db";
import { emptyRequest } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";

function itemText(fieldKey: string, value: string): { title: string; detail: string } {
  if (fieldKey === "feature" || fieldKey === "risk") {
    try {
      const parsed = JSON.parse(value) as { name?: string; description?: string };
      return { title: parsed.name ?? parsed.description ?? fieldKey, detail: parsed.description ?? parsed.name ?? value };
    } catch { /* use the approved text below */ }
  }
  return { title: value.slice(0, 160), detail: value };
}

async function POSTHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireContextItemApiAccess(auth.user, id, "edit");
  if (!access.ok) return access.response;
  const item = access.row;
  if (!item.initiativeId) return jsonError("Only initiative findings can become planning requests.", 422);
  if (item.status !== "approved" || !item.approvedValueText) return jsonError("Approve this AI finding before creating a request.", 409);
  const existing = await db.requestSourceRecord.findFirst({ where: { contextItemId: id, initiativeId: item.initiativeId } });
  if (existing) return jsonError("A request has already been created from this finding.", 409);
  const document = await db.document.findUnique({ where: { id: item.documentId }, select: { fileName: true } });
  if (!document) return jsonError("Source document not found.", 404);
  const text = itemText(item.fieldKey, item.approvedValueText);
  const linkedCapability = item.fieldKey === "feature" ? await db.capability.findFirst({ where: {
    intakeAnswerSet: { initiativeId: item.initiativeId }, name: text.title,
  }, select: { id: true } }) : null;
  const base = emptyRequest();
  const request = await saveRequest(item.initiativeId, {
    ...base, title: text.title, kind: item.fieldKey === "feature" ? "new_feature" : "other", source: "document",
    sourceReference: `${document.fileName}${item.sourcePageNumber ? ` · page ${item.sourcePageNumber}` : item.sourceSlideNumber ? ` · slide ${item.sourceSlideNumber}` : ""}`,
    documentUse: "create_backlog_items", requestor: auth.user.name, problem: text.detail,
    requestedChange: text.detail, outcome: text.detail, supportingMaterials: document.fileName,
  }, undefined, { actorUserId: auth.user.id, linkedCapabilityId: linkedCapability?.id, source: {
    type: "document_finding", label: document.fileName, rawContent: item.sourceExcerpt,
    locator: item.sourceHeading ?? (item.sourcePageNumber ? `page ${item.sourcePageNumber}` : item.sourceSlideNumber ? `slide ${item.sourceSlideNumber}` : undefined),
    documentId: item.documentId, contextItemId: item.id,
  } });
  return Response.json({ request }, { status: 201 });
}

export const POST = withApi(POSTHandler);
