import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/shell/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
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
  // Same cheap demo-user lookup every page already performs; the shell hides
  // itself client-side on /welcome, /, and the executive print route.
  const user = await getCurrentUser();
  const initiatives = await db.initiative.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true },
  });

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell
          hasProfile={user.profiles.length > 0}
          userName={user.name}
          initiatives={initiatives}
          demoModeEnabled={user.demoModeEnabled}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
