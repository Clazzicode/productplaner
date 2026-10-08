import { z } from "zod";
import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/documents/constants";
import { requestSchema } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";
import { parseRequestSpreadsheet, SPREADSHEET_EXTENSIONS } from "@/lib/requests/spreadsheetImport";

const importCommand = z.object({
  action: z.literal("import"), documentId: z.string().min(1),
  rows: z.array(z.object({ rowNumber: z.number().int().positive(), sheetName: z.string().min(1).max(200), raw: z.record(z.string(), z.string()), request: requestSchema })).min(1).max(500),
}).strict();

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!access.ok) return access.response;
  const initiative = await db.initiative.findUnique({ where: { id }, select: { organizationId: true, projectId: true } });
  if (!initiative) return jsonError("Not found.", 404);

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("Choose a spreadsheet to preview.", 422);
    if (file.size > MAX_IMPORT_FILE_BYTES) return jsonError("That spreadsheet is larger than 8MB.", 413);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(SPREADSHEET_EXTENSIONS as readonly string[]).includes(ext)) return jsonError("Upload a CSV, XLSX, or ODS spreadsheet.", 422);
    const bytes = Buffer.from(await file.arrayBuffer());
    let rows;
    try { rows = await parseRequestSpreadsheet(bytes, file.name); }
    catch (error) { return jsonError(error instanceof Error ? error.message : "Could not read that spreadsheet.", 422); }
    const document = await db.document.create({ data: {
      organizationId: initiative.organizationId, projectId: initiative.projectId, initiativeId: id, scope: "initiative_only",
      uploadedByUserId: auth.user.id, fileName: file.name, fileExt: ext, fileSizeBytes: file.size, fileBytes: bytes,
      status: "extracted", extractedChunksJson: JSON.stringify(rows.map(({ rowNumber, sheetName, raw }) => ({ rowNumber, sheetName, raw }))),
    }, select: { id: true } });
    return Response.json({ documentId: document.id, rows });
  }

  const parsed = importCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const document = await db.document.findFirst({ where: { id: parsed.data.documentId, initiativeId: id }, select: { id: true, fileName: true } });
  if (!document) return jsonError("Spreadsheet source not found.", 404);
  const imported = await withTransaction(async () => {
    const result = [];
    for (const row of parsed.data.rows) {
      result.push(await saveRequest(id, row.request, undefined, { actorUserId: auth.user.id, source: {
        type: "spreadsheet_row", label: document.fileName, locator: `${row.sheetName} row ${row.rowNumber}`,
        rawContent: JSON.stringify(row.raw), documentId: document.id,
      } }));
    }
    return result;
  }, { timeout: 20_000 });
  return Response.json({ requests: imported }, { status: 201 });
}

export const POST = withApi(POSTHandler);
