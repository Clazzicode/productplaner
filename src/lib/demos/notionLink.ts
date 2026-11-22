/** Only link to Notion hosts when a demo already contains an evidence URL. */
export function notionEvidenceLink(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item !== "string") continue;
    try {
      const url = new URL(item);
      const host = url.hostname.toLowerCase();
      if (url.protocol === "https:" && (host === "notion.so" || host.endsWith(".notion.so") || host === "notion.site" || host.endsWith(".notion.site"))) return url.toString();
    } catch { /* Older evidence may contain a free-form value. */ }
  }
  return null;
}
