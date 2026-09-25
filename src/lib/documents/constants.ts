// Document Import & Approved Context — plain constants only, deliberately
// dependency-free (no officeparser import) so client components can safely
// import them without pulling a Node-only parsing library into the browser
// bundle. src/lib/documents/extractChunks.ts (server-only) re-exports these
// for its own callers.

export const SUPPORTED_IMPORT_EXTENSIONS = ["pptx", "docx", "pdf"] as const;
export type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];
export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

export function isSupportedImportExtension(ext: string): ext is SupportedImportExtension {
  return (SUPPORTED_IMPORT_EXTENSIONS as readonly string[]).includes(ext);
}
