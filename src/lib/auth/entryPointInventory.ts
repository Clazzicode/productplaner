import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export type EntryPointClassification = { path: string; classification: string; reason: string; sourceFingerprint?: string };
const classifications = new Set(["authenticated-api", "authenticated-page", "optional-session-page", "authenticated-alias",
  "authentication", "authentication-callback", "authentication-page", "diagnostic", "worker", "webhook", "service-callback", "public-page", "public-demo", "public-redirect"]);
const scoped = new Set(["authenticated-api", "authenticated-page", "optional-session-page"]);
export const entryPointFingerprint = (source: string) => createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");

export function validateEntryPointInventory(sources: Record<string, string>, inventory: EntryPointClassification[]) {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const item of inventory) {
    if (seen.has(item.path)) issues.push(`${item.path}: duplicate inventory entry`);
    seen.add(item.path);
    const source = sources[item.path];
    if (source === undefined) { issues.push(`${item.path}: inventory points to a missing entry point`); continue; }
    if (!classifications.has(item.classification) || item.reason.trim().length < 20) issues.push(`${item.path}: explicit classification and reason required`);
    if (item.classification === "authenticated-api") {
      const methods = [...source.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b/g)];
      if (!methods.length) issues.push(`${item.path}: no authenticated route methods found`);
      for (const method of methods) if (!new RegExp(`export\\s+const\\s+${method[1]}\\s*=\\s*withAuthenticatedApi\\(`).test(source)) issues.push(`${item.path}: ${method[1]} must use withAuthenticatedApi`);
    } else if (scoped.has(item.classification)) {
      const wrapper = item.classification === "authenticated-page" ? "withAuthenticatedPage" : "withOptionalAuthenticatedPage";
      if (!source.includes(`export default ${wrapper}(`)) issues.push(`${item.path}: default export must use ${wrapper}`);
    } else if (item.sourceFingerprint !== entryPointFingerprint(source)) {
      issues.push(`${item.path}: exception changed; review its classification and reason and update its fingerprint`);
    }
  }
  for (const path of Object.keys(sources)) if (!seen.has(path)) issues.push(`${path}: unclassified entry point`);
  return issues;
}

export function inspectEntryPoints(root: string) {
  const sources: Record<string, string> = {};
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "__tests__") walk(path); continue; }
      if (!/\.[tj]sx?$/.test(entry.name)) continue;
      const key = relative(root, path).replaceAll("\\", "/");
      const source = readFileSync(path, "utf8");
      if ((key.startsWith("src/app/") && /\/(route\.ts|page\.tsx|layout\.tsx)$/.test(key)) || /^\s*["']use server["']/.test(source)) sources[key] = source;
    }
  }
  walk(join(root, "src"));
  const inventory = JSON.parse(readFileSync(join(root, "docs/ENTRY-POINT-INVENTORY.json"), "utf8")) as EntryPointClassification[];
  return validateEntryPointInventory(sources, inventory);
}
