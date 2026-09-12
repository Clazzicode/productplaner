import { OfficeParser } from "officeparser";

// Intake document import (docs/... "Import a document" feature): accepted file
// types and size ceiling. 8MB keeps uploads safely inside Netlify's synchronous
// function payload limit — these are text-heavy planning docs, not media files.
export const SUPPORTED_IMPORT_EXTENSIONS = ["pptx", "docx", "pdf"] as const;
export type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];
export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

// Bounds LLM cost/latency for outlier documents — planning decks/briefs comfortably
// fit well under this; anything larger is truncated rather than rejected. Exported
// so the /intake/import route can cap the re-submitted text at the same limit.
export const MAX_EXTRACTED_CHARS = 40_000;

export function isSupportedImportExtension(ext: string): ext is SupportedImportExtension {
  return (SUPPORTED_IMPORT_EXTENSIONS as readonly string[]).includes(ext);
}

export async function extractDocumentText(buffer: Buffer): Promise<string> {
  const ast = await OfficeParser.parseOffice(buffer, { ocr: false, extractAttachments: false });
  const { value } = await ast.to("text");
  return value.length > MAX_EXTRACTED_CHARS ? value.slice(0, MAX_EXTRACTED_CHARS) : value;
}
