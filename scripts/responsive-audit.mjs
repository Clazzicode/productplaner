// Run against a local server: node scripts/responsive-audit.mjs [path ...]
// Uses Chrome's built-in DevTools protocol, so no test dependency is needed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const chrome = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
if (!chrome) throw new Error("Chrome or Edge was not found; set CHROME_PATH.");

const requestedWidths = process.env.RESPONSIVE_WIDTHS?.split(',').map(Number);
const viewports = [
  ...[320, 360, 390, 440, 744, 768, 820, 1024, 1280, 1440, 1920].map((width) => ({
    width, height: width <= 440 ? 844 : 900, label: `${width}px`, mobile: width <= 440,
  })),
  { width: 844, height: 390, label: "phone landscape", mobile: true },
  { width: 820, height: 1180, label: "tablet portrait", mobile: false },
  { width: 1180, height: 820, label: "tablet landscape", mobile: false },
].filter(viewport => !requestedWidths || requestedWidths.includes(viewport.width));
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["/workflow-preview", "/login"];
const baseUrl = process.env.RESPONSIVE_BASE_URL ?? "http://localhost:3000";
const profile = await mkdtemp(path.join(tmpdir(), "gp-responsive-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      if (port) break;
    } catch { /* Browser is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port) throw new Error("Browser debugging port did not start.");

  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = tabs.find((tab) => tab.type === "page");
  if (!page) throw new Error("No browser page was available.");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command("Page.enable");
  await command("Runtime.enable");

  let failures = 0;
  for (const route of routes) {
    for (const { width, height, label, mobile } of viewports) {
      await command("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: 1, mobile,
      });
      await command("Page.navigate", { url: new URL(route, baseUrl).href });
      await new Promise((resolve) => setTimeout(resolve, 750));
      const evaluated = await command("Runtime.evaluate", {
        expression: `(() => {
          const root = document.documentElement;
          const viewport = root.clientWidth;
          const offenders = [...document.querySelectorAll('body *')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return rect.width > 0 && rect.right > viewport + 1 &&
                style.position !== 'fixed' && style.visibility !== 'hidden';
            })
            .slice(0, 5)
            .map((element) => element.tagName.toLowerCase() +
              (element.className && typeof element.className === 'string'
                ? '.' + element.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
          return { url: location.pathname, heading: document.querySelector('h1')?.textContent ?? '', guideCards: document.querySelectorAll('button[aria-controls][aria-expanded]').length, viewport, scrollWidth: root.scrollWidth,
            overflow: root.scrollWidth > viewport + 1, offenders };
        })()`,
        returnByValue: true,
      });
      const result = evaluated.result.value;
      const wrongPage = result.url !== new URL(route, baseUrl).pathname || !result.heading || (route.includes('view=guide') && result.guideCards !== 5);
      const failed = result.overflow || wrongPage;
      if (failed) failures++;
      console.log(`${failed ? "FAIL" : "PASS"} ${label.padStart(16)} ${route} → ${result.url} ${result.scrollWidth}/${result.viewport}${wrongPage ? ' expected application content missing' : ''}${result.overflow ? ` ${result.offenders.join(", ")}` : ""}`);
      if (!failed && route.includes('view=guide') && [320, 1280].includes(width)) {
        const layout = (await command("Runtime.evaluate", { expression: `(() => {
          const cards = [...document.querySelectorAll('button[aria-controls][aria-expanded]')];
          const boxes = cards.map(card => { const r=card.getBoundingClientRect(); return {top:r.top,left:r.left,width:r.width}; });
          cards[0].focus();
          return boxes;
        })()`, returnByValue: true })).result.value;
        const arranged = width === 320 ? layout.every((box,index) => !index || box.top > layout[index-1].top)
          : Math.abs(layout[0].top-layout[1].top)<2 && Math.abs(layout[2].top-layout[3].top)<2 && layout[2].top>layout[0].top && layout[4].top>layout[2].top;
        if (!arranged) { failures++; console.log(`FAIL ${label} guide card arrangement`); }
        const expected = ['Initiative','Features & Backlog','Stories & Acceptance Criteria','Roadmap','Sprint Planning'];
        for (let index=0;index<expected.length;index++) {
          await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
          await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
          await new Promise(resolve=>setTimeout(resolve,100));
          const choice=(await command('Runtime.evaluate',{expression:`(() => {
            const selected=document.querySelector('button[aria-expanded="true"]');
            const region=selected && document.getElementById(selected.getAttribute('aria-controls'));
            return {label:selected?.textContent,activeLabel:document.activeElement?.textContent,focused:document.activeElement===selected,link:region?.querySelector('a[href]')?.getAttribute('href')};
          })()`,returnByValue:true})).result.value;
          if (!choice.focused || !choice.label?.includes(expected[index]) || !choice.link?.startsWith('/initiatives/local-demo-only/')) {
            failures++; console.log(`FAIL ${label} keyboard entry ${expected[index]} ${JSON.stringify(choice)}`);
          }
          if (index<expected.length-1) {
            await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
            await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
          }
        }
        console.log(`CHECK ${label} guide arrangement and five keyboard selections completed`);
      }
      if (process.env.RESPONSIVE_SCREENSHOTS === "1" && label.endsWith("px") && [320, 1280].includes(width)) {
        const output = path.join(".next", "responsive-check", `${route.replace(/[^a-z0-9]/gi, "-")}-${width}.png`);
        await mkdir(path.dirname(output), { recursive: true });
        const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(output, Buffer.from(screenshot.data, "base64"));
      }
    }
  }
  if (failures) process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  // Only remove the exact temporary profile created by this script.
  const resolvedProfile = await realpath(profile);
  const resolvedTmp = await realpath(tmpdir());
  if (path.dirname(resolvedProfile) === resolvedTmp && path.basename(resolvedProfile).startsWith("gp-responsive-")) {
    if (browser.exitCode === null) await new Promise((resolve) => browser.once("exit", resolve));
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
