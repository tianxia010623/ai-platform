"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar, ChatSession } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function Sidebar({
  activeAvatarId,
  refreshSignal,
}: {
  activeAvatarId?: number;
  /** Bump this (e.g. `+1`) from a parent page to force the session list to
   * refetch -- used after a session gets auto-named from its first message,
   * since the sidebar otherwise has no way to know that happened. */
  refreshSignal?: number;
}) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [creatingForAvatarId, setCreatingForAvatarId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  useEffect(() => {
    api.listAvatars().then(setAvatars).catch(() => setAvatars([]));
  }, []);

  // Every avatar gets its own chat history nested directly under it, so we
  // fetch every session the user has (no avatar_id filter) once and group
  // them client-side -- simpler than re-fetching per avatar.
  useEffect(() => {
    api
      .listSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const sessionsByAvatar = useMemo(() => {
    const map = new Map<number, ChatSession[]>();
    for (const s of sessions) {
      const list = map.get(s.avatar_id) ?? [];
      list.push(s);
      map.set(s.avatar_id, list);
    }
    return map;
  }, [sessions]);

  async function commitRename(sessionId: number) {
    const title = editValue.trim();
    setEditingId(null);
    if (!title) return;
    const previous = sessions;
    setSessions((cur) => cur.map((s) => (s.id === sessionId ? { ...s, title } : s)));
    try {
      await api.renameSession(sessionId, title);
    } catch {
      setSessions(previous);
    }
  }

  async function handleNewChat(avatarId: number) {
    if (creatingForAvatarId) return;
    setCreatingForAvatarId(avatarId);
    try {
      const created = await api.createSession(avatarId);
      setSessions((prev) => [created, ...prev]);
      router.push(`/chat/${avatarId}?session=${created.id}`);
    } finally {
      setCreatingForAvatarId(null);
    }
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between px-4 py-5">
        <Link href="/" className="font-display text-lg font-semibold text-ink">
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

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-1 pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-ink-muted">
          The Cast
        </p>
        {avatars.map((avatar) => {
          const isActive = avatar.id === activeAvatarId;
          const img = avatarImageUrl(avatar);
          const avatarSessions = sessionsByAvatar.get(avatar.id) ?? [];
          return (
            <div key={avatar.id} className="mb-2">
              <Link
                href={`/chat/${avatar.id}`}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                  isActive ? "bg-accent-light font-medium text-accent" : "text-ink hover:bg-paper"
                )}
              >
                {img ? (
                  <img
                    src={img}
                    alt={avatar.name}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-surface"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent ring-2 ring-surface">
                    {avatar.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{avatar.name}</span>
              </Link>

              {/* This avatar's own chat history, nested right under it
                 instead of in one shared section. Collapsed for every
                 avatar except the one you're currently in -- click an
                 avatar to open it, which also expands its chat list. */}
              {isActive && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-line pl-2">
                {avatarSessions.map((s) =>
                  editingId === s.id ? (
                    <input
                      key={s.id}
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(s.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="block w-full truncate rounded-lg border border-accent bg-surface px-2 py-1 text-xs text-ink outline-none"
                    />
                  ) : (
                    <Link
                      key={s.id}
                      href={`/chat/${avatar.id}?session=${s.id}`}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingId(s.id);
                        setEditValue(s.title);
                      }}
                      title="双击重命名"
                      className={clsx(
                        "block truncate rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-paper",
                        pathname === `/chat/${avatar.id}` && "text-ink"
                      )}
                    >
                      {s.title}
                    </Link>
                  )
                )}
                <button
                  onClick={() => handleNewChat(avatar.id)}
                  disabled={creatingForAvatarId === avatar.id}
                  className="block w-full truncate rounded-lg px-2 py-1 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-accent hover:text-accent-hover disabled:opacity-50"
                >
                  + New Chat
                </button>
              </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <ThemeSwitcher />
        <Link
          href="/dashboard"
          className="mb-1 block rounded-lg px-2 py-2 text-sm text-ink hover:bg-paper"
        >
          Knowledge Dashboard
        </Link>
        <Link
          href="/feedback"
          className="mb-1 block rounded-lg px-2 py-2 text-sm text-ink hover:bg-paper"
        >
          Feedback Overview
        </Link>
        <Link
          href="/profile"
          className="mb-1 block rounded-lg px-2 py-2 text-sm text-ink hover:bg-paper"
        >
          Your Profile
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
