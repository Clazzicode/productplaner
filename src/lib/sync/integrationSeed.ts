import { db } from "@/lib/db";

// Provider registry seed (Product platform spec §2.8) — idempotent upserts,
// run lazily on first use like the demo user (no separate seed script).
// Logos/previews are clean branded placeholder tiles rendered client-side
// (see PROVIDER_BRAND in the hub), since real brand assets aren't bundled.

interface ProviderSeed {
  key: string;
  name: string;
  category: string;
  description: string;
  isFeatured: boolean;
  supportsImport: boolean;
  supportsExport: boolean;
  displayOrder: number;
  capabilities: { key: string; label: string }[];
}

const PROVIDERS: ProviderSeed[] = [
  {
    key: "jira",
    name: "Jira",
    category: "execution",
    description: "Sync epics, stories, acceptance criteria, sprint assignments, and issue keys.",
    isFeatured: true,
    supportsImport: false,
    supportsExport: true,
    displayOrder: 1,
    capabilities: [
      { key: "push_epics", label: "Push Epics" },
      { key: "push_stories", label: "Push Stories" },
      { key: "push_acceptance_criteria", label: "Push Acceptance Criteria" },
      { key: "push_sprint_assignments", label: "Push Sprint Assignments" },
      { key: "generate_demo_keys", label: "Generate Issue Keys" },
      { key: "simulate_status_pull", label: "Simulate Status Pull" },
    ],
  },
  {
    key: "aha",
    name: "Aha!",
    category: "roadmap",
    description: "Push roadmap initiatives and features, simulate priority updates.",
    isFeatured: true,
    supportsImport: true,
    supportsExport: true,
    displayOrder: 2,
    capabilities: [
      { key: "push_initiatives", label: "Push Roadmap Initiatives" },
      { key: "push_features", label: "Push Features" },
      { key: "simulate_priority_sync", label: "Simulate Priority Sync" },
    ],
  },
  {
    key: "azure_devops",
    name: "Azure DevOps",
    category: "execution",
    description: "Push work items and iterations, simulate completion and velocity pulls.",
    isFeatured: true,
    supportsImport: false,
    supportsExport: true,
    displayOrder: 3,
    capabilities: [
      { key: "push_work_items", label: "Push Work Items" },
      { key: "push_iterations", label: "Push Iterations" },
      { key: "simulate_completion_pull", label: "Simulate Completion Pull" },
    ],
  },
  {
    key: "confluence",
    name: "Confluence",
    category: "documentation",
    description: "Generate linked planning summaries and executive content.",
    isFeatured: false,
    supportsImport: false,
    supportsExport: true,
    displayOrder: 4,
    capabilities: [
      { key: "generate_summaries", label: "Generate Planning Summary Pages" },
      { key: "publish_executive", label: "Publish Executive Content" },
    ],
  },
  {
    key: "notion",
    name: "Notion",
    category: "documentation",
    description: "Publish the connected plan as linked pages and capability docs.",
    isFeatured: false,
    supportsImport: false,
    supportsExport: true,
    displayOrder: 5,
    capabilities: [
      { key: "publish_plan_pages", label: "Publish Plan Pages" },
      { key: "sync_capability_docs", label: "Sync Capability Docs" },
    ],
  },
  {
    key: "slack",
    name: "Slack",
    category: "communication",
    description: "Post plan notifications, lock events, and sync digests to a channel.",
    isFeatured: true,
    supportsImport: false,
    supportsExport: true,
    displayOrder: 6,
    capabilities: [
      { key: "post_notifications", label: "Post Plan Notifications" },
      { key: "post_digests", label: "Post Sync Digests" },
    ],
  },
  {
    key: "figma",
    name: "Figma",
    category: "design",
    description: "Link design files and attach frames to features and stories.",
    isFeatured: false,
    supportsImport: true,
    supportsExport: false,
    displayOrder: 7,
    capabilities: [
      { key: "link_design_files", label: "Link Design Files" },
      { key: "attach_frames", label: "Attach Frames to Stories" },
    ],
  },
  {
    key: "github",
    name: "GitHub",
    category: "source_control",
    description: "Link repositories and create issue references from stories.",
    isFeatured: false,
    supportsImport: true,
    supportsExport: true,
    displayOrder: 8,
    capabilities: [
      { key: "link_repositories", label: "Link Repositories" },
      { key: "create_demo_issue_refs", label: "Create Issue References" },
    ],
  },
];

let seeded = false;

/** Idempotent — safe to call on every hub page load; skips after first run per process. */
export async function ensureProvidersSeeded(): Promise<void> {
  if (seeded) return;
  for (const p of PROVIDERS) {
    const provider = await db.integrationProvider.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        category: p.category,
        description: p.description,
        isFeatured: p.isFeatured,
        supportsImport: p.supportsImport,
        supportsExport: p.supportsExport,
        displayOrder: p.displayOrder,
      },
      create: {
        key: p.key,
        name: p.name,
        category: p.category,
        description: p.description,
        isFeatured: p.isFeatured,
        supportsImport: p.supportsImport,
        supportsExport: p.supportsExport,
        displayOrder: p.displayOrder,
      },
    });
    for (const c of p.capabilities) {
      await db.integrationCapability.upsert({
        where: { providerId_capabilityKey: { providerId: provider.id, capabilityKey: c.key } },
        update: { capabilityLabel: c.label },
        create: { providerId: provider.id, capabilityKey: c.key, capabilityLabel: c.label },
      });
    }
  }
  seeded = true;
}
