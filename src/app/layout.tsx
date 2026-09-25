import type { Metadata } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/shell/AppShell";
import { CoachMarkProvider } from "@/components/coachmarks/CoachMarkProvider";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { getCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
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
  title: "Guided Product Planning Platform",
  description:
    "Methodology-aware planning: from a raw product idea to a connected, execution-ready plan prototype.",
};

export default async function RootLayout({
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
          project: { select: { id: true, name: true } },
          syncConnections: { where: { tool: "jira" }, select: { status: true }, take: 1 },
        },
      })
    : [];

  // Directive §4 "Experienced": coach marks show automatically once for this
  // tier; everyone else only sees them via "Replay Product Tour".
  const experienceLevel = user?.profiles[0]?.experienceLevel;
  const autoActive = experienceLevel === "experienced" || experienceLevel === "expert";
  // Directive item 6 (guided tour): the three initiative-scoped coach marks
  // (roadmap/planning_workspace/sprints_releases) need one real initiative to
  // route to — reuse the initiative list already loaded above rather than a
  // second query.
  const generatedInitiativeId = initiatives.find((i) => i.status === "generated")?.id ?? null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CoachMarkProvider
          signedIn={user != null}
          autoActive={autoActive}
          generatedInitiativeId={generatedInitiativeId}
        >
          <AppShell
            hasProfile={(user?.profiles.length ?? 0) > 0}
            userName={user?.name ?? ""}
            accessLevel={user?.accessLevel ?? "standard_user"}
            initiatives={initiatives}
          >
            {children}
          </AppShell>
        </CoachMarkProvider>
      </body>
    </html>
  );
}
