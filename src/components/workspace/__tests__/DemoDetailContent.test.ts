import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoDetailContent, type DemoDetailView } from "../DemoDetailPage";

const demo = {
  title: "Guided setup checklist",
  purpose: "Show the setup flow",
  status: "preparing",
  notes: "Use the updated script",
  completedWork: "Setup checklist completed",
  presenterNameSnapshot: "Jordan Kim",
  sprint: { sprintNumber: 24 },
  capability: { name: "Guided setup" },
};

function render(view: DemoDetailView) {
  return renderToStaticMarkup(createElement(DemoDetailContent, {
    view, demo, root: "/initiatives/example/workspace/demos", detail: "/initiatives/example/workspace/demos/demo-1",
    workTitle: "Onboarding story", engineer: "Jordan Kim", demoOwner: "Avery Lee",
    linkedNotion: null, readOnly: false,
  }));
}

describe("Demo detail views", () => {
  it("shows the recorded work and a real path to connect Notion", () => {
    const html = render("information");
    for (const value of ["Onboarding story", "Show the setup flow", "Jordan Kim", "Avery Lee", "Use the updated script", "Sprint 24", "Setup checklist completed"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("No Notion page linked");
    expect(html).toContain("Connect Notion");
    expect(html).toContain('href="/integrations"');
  });

  it.each(["google-meet", "zoom"] as const)("keeps the %s provider state truthful", (view) => {
    const html = render(view);
    expect(html).toContain("Not connected");
    expect(html).toContain("Not scheduled");
    expect(html).toContain("Not created");
    expect(html).toContain("No invitations sent");
    expect(html).toContain("No provider activity");
    expect(html).toContain("disabled");
    expect(html).not.toContain("meet.google.com/");
    expect(html).not.toContain("zoom.us/j/");
    expect(html).not.toContain("Invitations sent to");
    expect(html).not.toContain("Synced");
  });
});
