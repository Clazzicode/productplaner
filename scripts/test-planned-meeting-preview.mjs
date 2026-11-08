// Browser check for the development-only meeting preview. No product records
// or provider credentials are used.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const chrome = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(value => value && existsSync(value));
if (!chrome) throw new Error("Chrome or Edge is required.");
const profile = await mkdtemp(path.join(tmpdir(), "clarivia-meeting-check-"));
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); if (port) break; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!port) throw new Error("Browser debugging port did not start.");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 1;
  const pending = new Map();
  const requests = [];
  socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);
    if (data.method === "Network.requestWillBeSent") requests.push(data.params.request.url);
    if (!data.id) return;
    const task = pending.get(data.id); if (!task) return;
    pending.delete(data.id);
    if (data.error) task.reject(new Error(data.error.message));
    else task.resolve(data.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const key = id++; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
  await command("Page.enable"); await command("Runtime.enable"); await command("Network.enable");
  await command("Page.navigate", { url: process.env.PREVIEW_URL ?? "http://127.0.0.1:3012/workflow-preview?view=meeting" });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const controls = ["Google Meet", "Zoom", "Test connection", "Create meeting link", "Send invitations"];
  for (const label of controls) {
    const countBefore = requests.length;
    const result = await command("Runtime.evaluate", { expression: `(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim().startsWith(${JSON.stringify(label)})); if (!button) return { found: false, page: location.pathname, text: document.body.textContent.slice(0, 160) }; button.click(); return { found: true }; })()`, returnByValue: true });
    await new Promise(resolve => setTimeout(resolve, 200));
    const status = (await command("Runtime.evaluate", { expression: `document.querySelector('[role="status"]')?.textContent?.trim()`, returnByValue: true })).result.value;
    const sideEffects = requests.slice(countBefore).filter(url => /\/api\/|meet\.google|zoom\.us/i.test(url));
    if (!result.result.value.found || status !== "Test will be incorporated soon." || sideEffects.length) throw new Error(`${label}: ${JSON.stringify(result.result.value)}, status=${status}, network=${sideEffects.join(", ")}`);
    console.log(`PASS ${label}: exact message, no API/provider request`);
  }
  await command("Page.navigate", { url: "http://127.0.0.1:3012/workflow-preview?view=attendance" });
  await new Promise(resolve => setTimeout(resolve, 1000));
  for (const label of ["Refresh", "Match person"]) {
    const countBefore = requests.length;
    const clicked = await command("Runtime.evaluate", { expression: `(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim().startsWith(${JSON.stringify(label)})); if (!button) return false; button.click(); return true; })()`, returnByValue: true });
    await new Promise(resolve => setTimeout(resolve, 200));
    const status = (await command("Runtime.evaluate", { expression: `document.querySelector('[role="status"]')?.textContent?.trim()`, returnByValue: true })).result.value;
    const sideEffects = requests.slice(countBefore).filter(url => /\/api\/|meet\.google|zoom\.us/i.test(url));
    if (!clicked.result.value || status !== "Test will be incorporated soon." || sideEffects.length) throw new Error(`${label}: incorrect message or network request`);
    console.log(`PASS ${label}: exact message, no API/provider request`);
  }
} finally {
  socket?.close(); browser.kill();
  await new Promise(resolve => setTimeout(resolve, 400));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
