"use client";

import { Suspense } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import UserBadge from "@/components/UserBadge";
import { MenuIcon } from "@/components/icons";
import { AppDataProvider, useAppData } from "@/lib/app-data";
import { useAuth } from "@/lib/auth-context";

function MobileTopBar() {
  const { setNavOpen } = useAppData();
  const { user } = useAuth();
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-3 py-2 md:hidden">
      <button type="button" className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <Link href="/" className="font-display text-base font-semibold text-ink">
        AI Avatars
      </Link>
      <Link href="/profile" aria-label={`Profile of ${user?.username ?? "you"}`}>
        <UserBadge name={user?.username ?? ""} className="h-7 w-7 text-xs" />
      </Link>
    </header>
  );
}

/** Shell for every signed-in page: the sidebar is mounted once here and
 * persists across navigation; only the content area (app/(app)/template.tsx)
 * re-renders and animates. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppDataProvider>
        <div className="flex h-[100dvh] bg-paper">
          <Suspense fallback={<div className="hidden w-64 border-r border-line bg-surface md:block" />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileTopBar />
            <main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
          </div>
        </div>
      </AppDataProvider>
    </RequireAuth>
  );
}
