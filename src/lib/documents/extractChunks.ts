import { OfficeParser } from "officeparser";

// Document Import & Approved Context (directive §3). File-type/size
// constants live in ./constants.ts (deliberately dependency-free — see that
// file's header) so client components can import them without pulling this
// module's officeparser import into the browser bundle.
export { SUPPORTED_IMPORT_EXTENSIONS, MAX_IMPORT_FILE_BYTES, isSupportedImportExtension } from "./constants";
export type { SupportedImportExtension } from "./constants";

// Bounds LLM cost/latency for outlier documents, same limit the old flat-text
// extraction used — applied here as a running total across chunks instead of
// a single string slice.
export const MAX_TOTAL_CHUNK_CHARS = 40_000;

// Bounds how many chunks ever reach the AI prompt/DB row, independent of
// character count (a document with many tiny headings could otherwise
// produce an unreasonably long chunk list well under the char cap).
export const MAX_CHUNK_COUNT = 200;

export interface DocumentChunk {
  text: string;
  sourceType: string;
  pageNumber: number | null; // PDF only
  slideNumber: number | null; // PPTX only
  closestHeading: string | null;
  isTableChunk: boolean;
}

/**
 * Directive item 8 ("preserve page number, slide number, section heading...
 * to support traceability later"): uses officeparser's own document-structure
 * chunking (already a capability of the installed package, just unused by
 * the prior plain `.to("text")` call) instead of flattening the document to
 * one string — each chunk keeps its real page/slide/heading metadata so
 * later AI-extracted facts can cite exactly where they came from.
 */
export async function extractDocumentChunks(buffer: Buffer): Promise<DocumentChunk[]> {
  const ast = await OfficeParser.parseOffice(buffer, { ocr: false, extractAttachments: false });
  const { value } = await ast.to("chunks", {
    chunksConfig: {
      strategy: "document-structure",
      splitBy: "heading",
      maxChunkSize: 1500,
      tableSplitStrategy: "row",
    },
  });

  const chunks: DocumentChunk[] = [];
  let totalChars = 0;
  for (const chunk of value) {
    if (chunks.length >= MAX_CHUNK_COUNT || totalChars >= MAX_TOTAL_CHUNK_CHARS) break;
    chunks.push({
      text: chunk.text,
      sourceType: chunk.metadata.sourceType,
      pageNumber: chunk.metadata.pageNumber ?? null,
      slideNumber: chunk.metadata.slideNumber ?? null,
      closestHeading: chunk.metadata.closestHeading ?? null,
      isTableChunk: chunk.metadata.isTableChunk ?? false,
    });
    totalChars += chunk.text.length;
  }
  return chunks;
}
