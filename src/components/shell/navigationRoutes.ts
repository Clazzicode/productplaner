import type { NavInitiative } from "./LeftNav";

const labels: Record<string, string> = {
  home: "Home", projects: "Projects", initiatives: "Initiatives", new: "Create",
  integrations: "Integrations", jira: "Atlassian / Jira", teams: "Teams & Stakeholders",
  organizations: "Workspace", settings: "Settings", activity: "Activity", risks: "Risks & Blockers",
  decisions: "Decisions", onboarding: "Workspace setup", welcome: "Experience",
  role: "Working role", "workflow-preview": "Workflow preview", intake: "Planning questions",
  dashboard: "Initiative overview", backlog: "Feature backlog", requests: "Requests & Priorities",
  workspace: "Planning workspace", features: "Features", epics: "Epics", stories: "Story",
  roadmap: "Roadmap", documents: "Documents", refinement: "Refinement", capacity: "Capacity & Cost",
  matrix: "Matrix", executive: "Reports", sprints: "Sprints & Releases", demos: "Demos",
  validation: "PO Validation", feedback: "Feedback", "sprint-preparation": "Sprint Planning",
  "sprint-review": "Sprint Review", "release-readiness": "Release Readiness", review: "Plan review",
  admin: "Administration", users: "Users", access: "Roles & Access", "dashboard-configuration": "Dashboard Configuration",
};

export function pageNavigation(path: string, initiatives: NavInitiative[]) {
  const parts = path.split("/").filter(Boolean);
  const initiative = parts[0] === "initiatives" ? initiatives.find(i => i.id === parts[1]) : undefined;
  let parent = "/home";
  let parentLabel = "Home";
  if (parts[0] === "projects" && parts.length > 1) {
    parent = parts.length > 2 ? `/projects/${parts[1]}` : "/projects";
    parentLabel = parts.length > 2 ? "Project" : "Projects";
  } else if (parts[0] === "initiatives" && parts.length > 1) {
    parent = initiative?.project ? `/projects/${initiative.project.id}` : "/initiatives";
    parentLabel = initiative?.project?.name ?? "Initiatives";
    if (parts[2] === "workspace") {
      parent = `/initiatives/${parts[1]}/dashboard`;
      parentLabel = "Initiative overview";
      if (parts[3] === "stories") { parent = `/initiatives/${parts[1]}/workspace/features`; parentLabel = "Features"; }
    }
  } else if (parts[0] === "integrations" && parts.length > 1) {
    parent = "/integrations"; parentLabel = "Integrations";
  } else if (parts[0] === "teams" && parts.length > 1) {
    parent = "/teams"; parentLabel = "Teams & Stakeholders";
  } else if (parts[0] === "admin") {
    parent = parts.length > 2 ? `/${parts.slice(0, 2).join("/")}` : parts.length > 1 ? "/admin" : "/home";
    parentLabel = parts.length > 2 ? labels[parts[1]] : parts.length > 1 ? "Administration" : "Home";
  } else if (path === "/welcome") { parent = "/onboarding"; parentLabel = "Workspace setup";
  } else if (path === "/onboarding/role") { parent = "/welcome"; parentLabel = "Experience";
  } else if (path === "/workflow-preview") { parent = "/onboarding/role"; parentLabel = "Working role";
  } else if (path === "/home") { parent = "/projects"; parentLabel = "Projects"; }
  const last = parts.at(-1) ?? "home";
  const title = labels[last] ?? (parts[0] === "projects" ? "Project" : parts[0] === "teams" ? "Team" : parts[0] === "admin" ? "Details" : initiative?.name ?? "Clarivia");
  return { parent, parentLabel, title };
}
