import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LeftNav from "./LeftNav";
import NavTabs from "@/components/workspace/NavTabs";

const route = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const initiatives = [{
  id: "example", name: "Example", status: "generated", canEdit: true,
  project: { id: "project", name: "Project" }, syncConnections: [],
}];

describe("approved navigation map", () => {
  it("keeps all 30 destinations with Initiative and Sprint subsections", () => {
    const html = renderToStaticMarkup(createElement(LeftNav, { initiatives, canManageWorkspace: true }));
    // The brand also links to Home, in addition to the 30 destinations.
    expect((html.match(/<a\s/g) ?? []).length).toBe(31);
    expect(html).toContain("Five-tool guide");
    expect(html).toContain("Initiative brief");
    expect(html).toContain("Sprint Planning");
    expect(html).toContain("Sprints &amp; Releases");
    expect(html).toContain("Sprint Review");
    expect(html).toContain("Account settings");
    expect(html).not.toContain("All tools");
    expect(html).not.toContain("Planning</summary>");
    expect(html).not.toContain("Delivery</summary>");
    expect(html).not.toContain("Workspace</summary>");
    expect(html.indexOf("Home</span>")).toBeLessThan(html.indexOf("Projects</span>"));
    expect(html.indexOf("Projects</span>")).toBeLessThan(html.indexOf("Five-tool guide</span>"));
    expect(html.indexOf("Plan</summary>")).toBeLessThan(html.indexOf("Deliver</summary>"));
    expect(html.indexOf("Deliver</summary>")).toBeLessThan(html.indexOf("Learn</summary>"));
    expect(html.indexOf("Learn</summary>")).toBeLessThan(html.indexOf("Account settings</span>"));
  });

  it.each(["epics", "refinement", "documents", "regeneration", "features", "sprint-preparation", "sprints", "sprint-review", "demos", "validation", "capacity", "release-readiness", "matrix", "executive"])("hides the shared link strip on %s", section => {
    route.pathname = `/initiatives/example/workspace/${section}`;
    expect(renderToStaticMarkup(createElement(NavTabs, { initiativeId: "example" }))).toBe("");
  });

  it("retains the related-work link strip on Roadmap", () => {
    route.pathname = "/initiatives/example/workspace/roadmap";
    expect(renderToStaticMarkup(createElement(NavTabs, { initiativeId: "example" }))).toContain("Sprint Planning");
  });
});
