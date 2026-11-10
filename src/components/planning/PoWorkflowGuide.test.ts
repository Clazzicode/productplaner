import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PoWorkflowGuide from "./PoWorkflowGuide";
import { PO_WORKFLOW } from "@/lib/planning/poWorkflow";

describe("five-tool guide navigation", () => {
  it("renders one working destination for each ordered tool", () => {
    const markup = renderToStaticMarkup(createElement(PoWorkflowGuide, { initiativeId: "initiative-123", hasWorkspace: true }));
    const links = markup.match(/href="\/initiatives\/initiative-123\/[^"]+"/g) ?? [];
    expect(links).toHaveLength(5);
    expect(PO_WORKFLOW.map((step) => step.title)).toEqual([
      "Initiative", "Features & Backlog", "Stories & Acceptance Criteria", "Roadmap", "Sprint Planning",
    ]);
    for (const step of PO_WORKFLOW) {
      expect(markup).toContain(`href="/initiatives/initiative-123/${step.destination}"`);
      expect(existsSync(join(process.cwd(), "src", "app", "initiatives", "[initiativeId]", ...step.destination.split("/"), "page.tsx"))).toBe(true);
    }
  });

  it("does not offer destinations that require an initial plan before one exists", () => {
    const markup = renderToStaticMarkup(createElement(PoWorkflowGuide, { initiativeId: "initiative-123", hasWorkspace: false }));
    expect(markup).toContain('href="/initiatives/initiative-123/intake"');
    expect(markup).toContain('href="/initiatives/initiative-123/backlog"');
    expect(markup).not.toContain('href="/initiatives/initiative-123/workspace/epics"');
    expect(markup).not.toContain('href="/initiatives/initiative-123/workspace/roadmap"');
    expect(markup).not.toContain('href="/initiatives/initiative-123/workspace/sprint-preparation"');
    expect(markup.match(/Create the initial plan to open this tool\./g)).toHaveLength(3);
  });
});
