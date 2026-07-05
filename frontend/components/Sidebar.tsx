"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar, ChatSession } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

export default function Sidebar({ activeAvatarId }: { activeAvatarId?: number }) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const pathname = usePathname();
  const { logout, user } = useAuth();

  useEffect(() => {
    api.listAvatars().then(setAvatars).catch(() => setAvatars([]));
  }, []);

  useEffect(() => {
    if (activeAvatarId) {
      api
        .listSessions(activeAvatarId)
        .then(setSessions)
        .catch(() => setSessions([]));
    } else {
      setSessions([]);
    }
  }, [activeAvatarId]);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold text-ink">
          AI Avatars
        </Link>
      </div>

      <div className="px-3">
        <Link
          href="/avatar/new"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          + New Avatar
        </Link>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Your Avatars
        </p>
        {avatars.map((avatar) => {
          const isActive = avatar.id === activeAvatarId;
          const img = avatarImageUrl(avatar);
          return (
            <Link
              key={avatar.id}
              href={`/chat/${avatar.id}`}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                isActive ? "bg-accent-light text-accent font-medium" : "text-ink hover:bg-gray-100"
              )}
            >
              {img ? (
                <img src={img} alt={avatar.name} className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">
                  {avatar.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{avatar.name}</span>
            </Link>
          );
        })}

        {activeAvatarId && sessions.length > 0 && (
          <div className="mt-4">
            <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Chat History
            </p>
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/chat/${activeAvatarId}?session=${s.id}`}
                className={clsx(
                  "block truncate rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-gray-100",
                  pathname === `/chat/${activeAvatarId}` && "text-ink"
                )}
              >
                {s.title}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-gray-200 px-3 py-3">
        <Link
          href="/dashboard"
          className="mb-1 block rounded-lg px-2 py-2 text-sm text-ink hover:bg-gray-100"
        >
          Knowledge Dashboard
        </Link>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="truncate text-xs text-ink-muted">{user?.username}</span>
          <button onClick={logout} className="text-xs text-ink-muted hover:text-accent">
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
