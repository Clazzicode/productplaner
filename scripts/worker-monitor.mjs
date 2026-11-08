// Existing GitHub Actions delivery channel; never includes source data or credentials.
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { workerAlerts } from "../src/lib/jobs/monitorModel.ts";
const fixture = process.argv.includes("--staging-fixture");
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (repo !== "Clazzicode/productplaner" || !token) throw new Error("Repository-owned monitoring credentials are required");
let input;
let environment = "production";
if (fixture) {
  if (process.env.APP_ENVIRONMENT !== "staging" || process.env.STAGING_SUPABASE_PROJECT_REF !== "qbogvclmehvrtuwiktos") throw new Error("Staging-only alert fixture");
  input = JSON.parse(await readFile(".tmp-tests/staging-worker-alert.json", "utf8"));
  if (!input.synthetic) throw new Error("Expected deliberate staging failure evidence");
  environment = "staging acceptance test";
} else {
  try {
  const response = await fetch("https://www.nextgendepot.online/api/ready", { signal: AbortSignal.timeout(20_000), redirect: "error", headers: { "cache-control": "no-cache" } });
  input = await response.json().catch(() => ({}));
  } catch { input = { status: "unavailable", workers: { jira: "unknown", background: "unknown" } }; }
}
const observedAt = new Date().toISOString();
const alerts = workerAlerts(input, new Date(Date.now()-24*60*60*1000).toISOString());
async function github(path, method = "GET", body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub alert delivery failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
const issues = [];
for (let page=1; page<=10; page++) {
  const rows = await github(`issues?state=all&per_page=100&page=${page}`);
  issues.push(...rows.filter(row => !row.pull_request));
  if (rows.length<100) break;
  if (page===10) throw new Error("Monitoring issue inventory exceeded its safe pagination bound");
}
const delivered = [];
for (const alert of alerts) {
  const marker = `<!-- clarivia-worker-alert:${environment}:${alert.key} -->`;
  const existing = issues.find(row => row.body?.includes(marker));
  if (existing && (existing.state === "open" || alert.key.includes(":terminal:"))) { delivered.push({ key: alert.key, url: existing.html_url, existing: true }); continue; }
  const body = `${marker}\n${fixture ? "Deliberate staging acceptance failure; Production was not changed." : "Production worker monitoring alert."}\n\n${alert.reason}\n\nObserved: ${observedAt}\nEvidence: https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nOnly operational counts/status/timestamps are reported. Inspect authenticated logs before taking recovery action. Jira remains read-only.`;
  const saved = existing ? await github(`issues/${existing.number}`, "PATCH", { state: "open", body }) : await github("issues", "POST", { title: `[Clarivia ${environment}] ${alert.worker}: ${alert.key.includes("terminal") ? "terminal job failure" : alert.key.endsWith("failed") ? "consecutive failed worker cycles" : "stale / unavailable worker"}`, body });
  delivered.push({ key: alert.key, url: saved.html_url, existing: false });
}
// Resolve current-state incidents after recovery. Terminal job incidents require human review.
if (!fixture) for (const issue of issues) {
  const match = issue.body?.match(/<!-- clarivia-worker-alert:production:((?:jira|background):(?:stale|failed)|readiness) -->/);
  if (match && issue.state === "open" && !alerts.some(row => row.key===match[1])) await github(`issues/${issue.number}`, "PATCH", { state: "closed", state_reason: "completed" });
}
await mkdir(".tmp-tests", { recursive: true });
const report = { observedAt, environment, source: fixture ? "deliberate staging failure verified through readiness" : "production readiness endpoint", release: input.release ?? null, status: input.status ?? "unavailable", workers: input.workers ?? {}, workerSignals: input.workerSignals ?? [], workerObservation: input.workerObservation ?? [], delivered };
await writeFile(".tmp-tests/worker-monitor.json", JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Clarivia worker monitoring\n\n${environment}: ${report.status} at ${observedAt}.\n\n${delivered.map(row => `- [${row.key}](${row.url})`).join("\n") || "No alert threshold reached."}\n`);
console.log(JSON.stringify({ environment, status: report.status, alertCount: delivered.length, delivered: delivered.map(row => row.url) }));
if (alerts.length && !fixture) process.exitCode=1;
