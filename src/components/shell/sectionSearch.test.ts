import { describe, expect, it } from "vitest";
import { buildSidebarGroups } from "./LeftNav";
import { searchSections, sectionDestinations } from "./sectionSearch";

const groups = buildSidebarGroups({ initiatives: [{ id: "initiative-1", name: "Demo", status: "generated", canEdit: true, project: null, syncConnections: [] }], canManageWorkspace: true }, "/home");
const sections = sectionDestinations(groups);

describe("section search", () => {
  it("links nested sections to the current initiative", () => {
    expect(searchSections("sprint planning", sections)[0]).toMatchObject({ label: "Sprint Planning", href: "/initiatives/initiative-1/workspace/sprint-preparation" });
    expect(searchSections("initiative brief", sections)[0]).toMatchObject({ label: "Initiative brief", href: "/initiatives/initiative-1/intake" });
  });

  it("ranks section names and related terms", () => {
    expect(searchSections("roadmap", sections)[0].label).toBe("Roadmap");
    expect(searchSections("milestones", sections)[0].label).toBe("Roadmap");
    expect(searchSections("acceptance criteria", sections).some(result => result.label === "Stories & Criteria")).toBe(true);
  });

  it("does not offer sections that require an initiative when none exists", () => {
    const unscoped = sectionDestinations(buildSidebarGroups({ initiatives: [] }, "/home"));
    expect(searchSections("roadmap", unscoped)).toEqual([]);
    expect(searchSections("projects", unscoped)[0].href).toBe("/projects");
  });
});
