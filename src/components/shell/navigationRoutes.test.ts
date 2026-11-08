import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pageNavigation } from "./navigationRoutes";

const pages = readdirSync("src/app", { recursive: true }).filter((file): file is string => typeof file === "string" && file.endsWith("page.tsx"));
const routes = pages.map(file => "/" + file.replaceAll(path.sep, "/").replace(/\/?page\.tsx$/, ""));
const routePatterns = routes.map(route => new RegExp("^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "$"));
const initiatives = [{ id: "example", name: "Example initiative", status: "generated", project: { id: "project-example", name: "Example project" }, syncConnections: [] }];

describe("navigation coverage", () => {
  it.each(routes)("provides a working parent destination for %s", route => {
    const current = route.replace(/\[[^\]]+\]/g, "example");
    const navigation = pageNavigation(current, initiatives);
    expect(routePatterns.some(pattern => pattern.test(navigation.parent))).toBe(true);
    expect(navigation.parent).not.toBe(current);
    expect(navigation.title.length).toBeGreaterThan(0);
  });
  it("returns to the current project's home from initiative setup", () => {
    expect(pageNavigation("/projects/project-example/initiatives/new", initiatives).parent).toBe("/projects/project-example");
    expect(pageNavigation("/initiatives/example/intake", initiatives).parent).toBe("/projects/project-example");
  });
  it("provides a destination even for a stale initiative or a direct Jira link", () => {
    expect(pageNavigation("/initiatives/missing/intake", []).parent).toBe("/initiatives");
    expect(pageNavigation("/integrations/jira", []).parent).toBe("/integrations");
  });
  it("avoids the workspace index redirect when leaving Sprint Planning", () => {
    expect(pageNavigation("/initiatives/example/workspace/sprint-preparation", initiatives).parent).toBe("/initiatives/example/dashboard");
  });
});
