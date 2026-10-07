import { OfficeParser, type OfficeContentNode } from "officeparser";
import { emptyRequest, requestKinds, type RequestInput } from "./model";

export const SPREADSHEET_EXTENSIONS = ["csv", "xlsx", "ods"] as const;
export const MAX_SPREADSHEET_ROWS = 500;

export interface SpreadsheetRequestRow {
  rowNumber: number;
  sheetName: string;
  raw: Record<string, string>;
  request: RequestInput;
  warnings: string[];
}

const aliases: Record<string, string[]> = {
  title: ["title", "request", "summary", "name"],
  kind: ["work type", "type", "kind", "issue type"],
  requestor: ["requestor", "requester", "business owner", "owner"],
  problem: ["problem", "problem statement"],
  requestedChange: ["requested change", "description", "change"],
  outcome: ["outcome", "expected outcome"],
  severity: ["severity", "bug severity"],
  affectedArea: ["affected area", "component"],
  observedBehavior: ["observed behavior", "actual behavior"],
  expectedBehavior: ["expected behavior"],
  reproductionDetails: ["reproduction details", "steps to reproduce"],
  environment: ["environment"],
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const pick = (raw: Record<string, string>, key: keyof typeof aliases) => aliases[key].map(normalize).map((alias) => raw[alias]).find(Boolean) ?? "";

function cells(row: OfficeContentNode): string[] {
  return (row.children ?? []).filter((node) => node.type === "cell").map((node) => (node.text ?? "").trim());
}

function kindFrom(value: string): RequestInput["kind"] {
  const normalized = normalize(value).replaceAll(" ", "_");
  if ((requestKinds as readonly string[]).includes(normalized)) return normalized as RequestInput["kind"];
  if (normalized === "feature" || normalized === "feature_request") return "new_feature";
  return "other";
}

export function rowsFromNodes(content: OfficeContentNode[], fileName: string): SpreadsheetRequestRow[] {
  const output: SpreadsheetRequestRow[] = [];
  const sheets = content.filter((node) => node.type === "sheet");
  for (const sheet of sheets) {
    const sheetName = sheet.type === "sheet" ? sheet.metadata?.sheetName ?? "Sheet 1" : "Sheet 1";
    const rows = (sheet.children ?? []).filter((node) => node.type === "row");
    const headers = cells(rows[0] ?? { type: "row" }).map(normalize);
    for (let index = 1; index < rows.length && output.length < MAX_SPREADSHEET_ROWS; index += 1) {
      const values = cells(rows[index]);
      if (!values.some(Boolean)) continue;
      const raw = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
      const title = pick(raw, "title");
      const kind = kindFrom(pick(raw, "kind"));
      const isBug = kind === "bug" || kind === "defect";
      const severity = normalize(pick(raw, "severity"));
      const base = emptyRequest();
      const request: RequestInput = {
        ...base, title, kind, source: "spreadsheet", sourceReference: `${fileName} · ${sheetName} · row ${index + 1}`,
        requestor: pick(raw, "requestor") || "Unassigned requestor", problem: pick(raw, "problem"),
        requestedChange: pick(raw, "requestedChange"), outcome: pick(raw, "outcome"),
        bug: { ...base.bug, severity: ["low", "medium", "high", "critical"].includes(severity) ? severity as RequestInput["bug"]["severity"] : "medium",
          affectedArea: pick(raw, "affectedArea"), observedBehavior: pick(raw, "observedBehavior"),
          expectedBehavior: pick(raw, "expectedBehavior"), reproductionDetails: pick(raw, "reproductionDetails"), environment: pick(raw, "environment") },
        priority: { ...base.priority, bugSeverity: isBug && ["low", "medium", "high", "critical"].includes(severity)
          ? severity as RequestInput["priority"]["bugSeverity"] : isBug ? "medium" : "not_applicable" },
      };
      const warnings = [!title ? "Missing title" : "", !pick(raw, "problem") ? "Missing problem" : "",
        !pick(raw, "requestedChange") ? "Missing requested change" : "", !pick(raw, "outcome") ? "Missing expected outcome" : ""].filter(Boolean);
      if (isBug) {
        if (!request.bug.affectedArea) warnings.push("Missing affected area");
        if (!request.bug.observedBehavior) warnings.push("Missing observed behavior");
        if (!request.bug.expectedBehavior) warnings.push("Missing expected behavior");
      }
      output.push({ rowNumber: index + 1, sheetName, raw, request, warnings });
    }
  }
  return output;
}

export async function parseRequestSpreadsheet(buffer: Buffer, fileName: string): Promise<SpreadsheetRequestRow[]> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !(SPREADSHEET_EXTENSIONS as readonly string[]).includes(ext)) throw new Error("Upload a CSV, XLSX, or ODS spreadsheet.");
  const ast = await OfficeParser.parseOffice(buffer, { fileType: ext as "csv" | "xlsx" | "ods", ocr: false, extractAttachments: false });
  const rows = rowsFromNodes(ast.content, fileName);
  if (rows.length === 0) throw new Error("No data rows were found. Include a header row and at least one request.");
  return rows;
}
