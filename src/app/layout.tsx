import { withOptionalAuthenticatedPage } from "@/lib/auth/entryPoints";
import type { Metadata } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/shell/AppShell";
import PageNavigation from "@/components/shell/PageNavigation";
import { CoachMarkProvider } from "@/components/coachmarks/CoachMarkProvider";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { getCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { isTestEnvironment } from "@/lib/environment";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
});

// The shell reads the demo user + initiative list on every request — keep the
// whole tree dynamic so nothing tries to prerender against the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clarivia",
  description:
    "Methodology-aware planning: from a raw product idea to a connected, execution-ready plan prototype.",
};

async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Deliberately getCurrentUser(), not requireCurrentUser(): this layout also
  // wraps /login itself, so it must render (bare, chrome-free — bareMode.ts
  // hides the shell whenever hasProfile is false) rather than redirect when
  // signed out. Each page enforces its own auth requirement.
  const user = await getCurrentUser();
  if (user) establishAuthContext(user.authUserId);
  // Step 8C (docs/V2-RESOURCE-ACCESS.md §16): the switcher/nav initiative list
  // is authorized-scoped too — it drives real navigation targets, so it must
  // never offer an initiative a detail page would then reject.
  const authorizedInitiativeIds = user ? await listAuthorizedInitiativeIds(user) : [];
  const initiatives = user
    ? await db.initiative.findMany({
        where: { id: { in: authorizedInitiativeIds ?? [] } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          prototype: { select: { id: true } },
          project: { select: { id: true, name: true } },
          syncConnections: { where: { tool: "jira" }, select: { status: true }, take: 1 },
        },
      })
    : [];
  const permissions = user && initiatives.length ? await db.$queryRaw<{ id: string; edit: boolean }[]>`
    SELECT id,app_private.can_initiative_action(id,'edit') AS edit FROM public."Initiative"
    WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(initiatives.map(row => row.id))}::jsonb))` : [];
  const navigationInitiatives = initiatives.map(({ prototype, ...row }) => ({ ...row, hasWorkspace: Boolean(prototype), canEdit: permissions.find(permission => permission.id === row.id)?.edit ?? false }));
  const canManageWorkspace = user?.memberType === "internal" && ["owner", "admin"].includes(user.permissionRole);

  // Tours are opt-in for every account. Historical experience has no effect.
  // Directive item 6 (guided tour): the three initiative-scoped coach marks
  // (roadmap/planning_workspace/sprints_releases) need one real initiative to
  // route to — reuse the initiative list already loaded above rather than a
  // second query.
  const generatedInitiativeId = initiatives.find((i) => i.prototype)?.id ?? null;
  const testEnvironment = isTestEnvironment();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {testEnvironment && (
          <aside aria-label="Test environment" className="no-print z-50 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">
            CLARIVIA TEST ENVIRONMENT · Use test accounts only · Separate from Production
          </aside>
        )}
        <CoachMarkProvider
          signedIn={user != null}
          generatedInitiativeId={generatedInitiativeId}
        >
          <PageNavigation signedIn={user != null} canManageWorkspace={canManageWorkspace} initiatives={navigationInitiatives} />
          <AppShell
            signedIn={user != null}
            canManageWorkspace={canManageWorkspace}
            userName={user?.name ?? ""}
            accessLevel={user?.accessLevel ?? "standard_user"}
            initiatives={navigationInitiatives}
          >
            {children}
          </AppShell>
        </CoachMarkProvider>
      </body>
    </html>
  );
}

export default withOptionalAuthenticatedPage(RootLayout);
