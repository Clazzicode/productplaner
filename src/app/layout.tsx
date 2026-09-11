import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/shell/AppShell";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { getCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        select: { id: true, name: true, status: true },
      })
    : [];

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell
          hasProfile={(user?.profiles.length ?? 0) > 0}
          userName={user?.name ?? ""}
          accessLevel={user?.accessLevel ?? "standard_user"}
          initiatives={initiatives}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
