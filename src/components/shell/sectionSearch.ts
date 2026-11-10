import type { SidebarGroup, SidebarSubgroup } from "./Sidebar";
import type { NavigationItemProps } from "./NavigationItem";

export type SectionDestination = { label: string; href: string; group: string; keywords: string };

const aliases: Record<string, string> = {
  "Requests & Priorities": "request intake capture clarify prioritize priority",
  "Features & Backlog": "feature backlog grooming",
  "Stories & Criteria": "epics stories acceptance criteria requirements",
  "Five-tool guide": "guide tools overview",
  "Roadmap": "now next later timeline milestones connections",
  "Sprint": "sprint planning releases review delivery",
  "Demos": "demo presentation evidence",
  "PO Validation": "product owner approval acceptance",
  "Reports": "insights analytics executive trend",
  "Teams & Stakeholders": "people owners",
  "Initiatives": "initiative list brief",
};

function hasItems(item: NavigationItemProps | SidebarSubgroup): item is SidebarSubgroup {
  return "items" in item;
}

export function sectionDestinations(groups: SidebarGroup[]): SectionDestination[] {
  return groups.flatMap(group => group.items.flatMap(item => {
    const entries = hasItems(item) ? item.items : [item];
    return entries.flatMap(entry => entry.href ? [{
      label: entry.label,
      href: entry.href,
      group: group.title || "Top",
      keywords: `${entry.label} ${item.label} ${group.title} ${aliases[entry.label] ?? ""}`.toLowerCase(),
    }] : []);
  }));
}

export function searchSections(query: string, sections: SectionDestination[]): SectionDestination[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return sections.map(section => {
    const label = section.label.toLowerCase();
    const score = terms.reduce((sum, term) => {
      if (label === term) return sum + 100;
      if (label.startsWith(term)) return sum + 70;
      if (label.includes(term)) return sum + 45;
      if (section.keywords.includes(term)) return sum + 20;
      return sum - 100;
    }, 0);
    return { section, score };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.section.label.localeCompare(b.section.label)).map(row => row.section);
}
