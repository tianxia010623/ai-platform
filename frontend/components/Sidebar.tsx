"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/errors";
import type { Avatar, ChatSession } from "@/lib/types";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import Modal from "@/components/ui/Modal";
import UserBadge from "@/components/UserBadge";
import {
  ChartIcon,
  CloseIcon,
  FlaskIcon,
  HomeIcon,
  LogoutIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";

function AvatarDot({ avatar, size = "h-7 w-7" }: { avatar: Avatar; size?: string }) {
  const img = avatarImageUrl(avatar);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} alt="" className={clsx(size, "shrink-0 rounded-full object-cover ring-2 ring-surface")} />
  ) : (
    <span
      className={clsx(
        size,
        "flex shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent ring-2 ring-surface"
      )}
    >
      {avatar.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
        active ? "bg-accent-light font-medium text-accent" : "text-ink hover:bg-paper"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export default function Sidebar() {
  const { avatars, sessions, upsertSession, removeSession, navOpen, setNavOpen } = useAppData();
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeAvatarId = useMemo(() => {
    const m = pathname.match(/^\/(?:chat|avatar)\/(\d+)/);
    return m ? Number(m[1]) : undefined;
  }, [pathname]);
  const activeSessionId = Number(searchParams.get("session")) || undefined;
  const isHome = pathname === "/";

  // Which avatar's chat list is open. Follows the active avatar, but a click
  // on the already-open avatar collapses it without navigating.
  const [expandedId, setExpandedId] = useState<number | undefined>(activeAvatarId);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const [deleteTitle, setDeleteTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (activeAvatarId) setExpandedId(activeAvatarId);
  }, [activeAvatarId]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, searchParams, setNavOpen]);

  const sessionsByAvatar = useMemo(() => {
    const map = new Map<number, ChatSession[]>();
    for (const s of sessions) {
      const list = map.get(s.avatar_id) ?? [];
      list.push(s);
      map.set(s.avatar_id, list);
    }
    return map;
  }, [sessions]);

  function handleAvatarClick(avatarId: number, e: React.MouseEvent) {
    if (expandedId === avatarId) {
      e.preventDefault();
      setExpandedId(undefined);
    } else {
      setExpandedId(avatarId);
      if (pathname === `/chat/${avatarId}`) e.preventDefault();
    }
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id);
    setEditValue(s.title);
  }

  async function commitRename(session: ChatSession) {
    const title = editValue.trim();
    setEditingId(null);
    if (!title || title === session.title) return;
    upsertSession({ ...session, title });
    try {
      upsertSession(await api.renameSession(session.id, title));
    } catch {
      upsertSession(session);
    }
  }

  async function confirmDeleteSession() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteSession(target.id);
      removeSession(target.id);
      setPendingDelete(null);
      if (activeSessionId === target.id) router.push(`/chat/${target.avatar_id}`);
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-30 bg-ink/30 backdrop-blur-[1px] transition-opacity md:hidden",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-72 shrink-0 flex-col border-r border-line bg-surface shadow-xl transition-transform duration-300 ease-out md:static md:z-auto md:w-64 md:translate-x-0 md:shadow-none",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between px-4 py-5">
          <Link href="/" className="font-display text-lg font-semibold text-ink">
            AI Avatars
          </Link>
          <button
            type="button"
            className="icon-btn md:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-1 px-3">
          <Link href="/avatar/new" className="btn-primary mb-2 w-full py-2">
            <PlusIcon /> New Avatar
          </Link>
          <NavLink href="/" active={isHome} icon={<HomeIcon />}>
            Home
          </NavLink>
          <NavLink href="/dashboard" active={pathname === "/dashboard"} icon={<ChartIcon />}>
            Knowledge Dashboard
          </NavLink>
        </div>

        {isHome ? (
          <div className="flex-1" />
        ) : (
          <nav className="mt-5 flex-1 animate-fade-in space-y-1 overflow-y-auto px-3" aria-label="Avatars and chats">
            <p className="px-1 pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-ink-muted">
              The Cast
            </p>
            {avatars.map((avatar) => {
              const isActive = avatar.id === activeAvatarId;
              const avatarSessions = sessionsByAvatar.get(avatar.id) ?? [];
              return (
                <div key={avatar.id} className="mb-1">
                  <Link
                    href={`/chat/${avatar.id}`}
                    onClick={(e) => handleAvatarClick(avatar.id, e)}
                    aria-expanded={expandedId === avatar.id}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                      isActive ? "bg-accent-light font-medium text-accent" : "text-ink hover:bg-paper"
                    )}
                  >
                    <AvatarDot avatar={avatar} />
                    <span className="truncate">{avatar.name}</span>
                  </Link>

                  {expandedId === avatar.id && (
                    <div className="ml-4 mt-1 animate-fade-in space-y-0.5 border-l border-line pl-2">
                      {avatarSessions.map((s) =>
                        editingId === s.id ? (
                          <input
                            key={s.id}
                            autoFocus
                            value={editValue}
                            maxLength={60}
                            aria-label="Chat title"
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitRename(s)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(s);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="block w-full rounded-lg border border-accent bg-surface px-2 py-1 text-xs text-ink outline-none"
                          />
                        ) : (
                          <div
                            key={s.id}
                            className={clsx(
                              "group flex items-center rounded-lg pr-1 transition",
                              activeSessionId === s.id ? "bg-paper text-ink" : "text-ink-muted hover:bg-paper"
                            )}
                          >
                            <Link
                              href={`/chat/${avatar.id}?session=${s.id}`}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                startRename(s);
                              }}
                              className="min-w-0 flex-1 truncate px-2 py-1.5 text-xs"
                              aria-current={activeSessionId === s.id ? "page" : undefined}
                            >
                              {s.title}
                            </Link>
                            <span className="flex shrink-0 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                              <button
                                type="button"
                                onClick={() => startRename(s)}
                                className="rounded p-1 text-ink-muted hover:text-ink"
                                aria-label={`Rename “${s.title}”`}
                                title="Rename"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingDelete(s);
                                  setDeleteTitle(s.title);
                                  setDeleteError(null);
                                }}
                                className="rounded p-1 text-ink-muted hover:text-danger"
                                aria-label={`Delete “${s.title}”`}
                                title="Delete"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </div>
                        )
                      )}
                      <Link
                        href={`/chat/${avatar.id}?new=1`}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-accent hover:text-accent-hover"
                      >
                        <PlusIcon className="h-3 w-3" /> New Chat
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        <div className="border-t border-line px-3 py-3">
          <p className="px-2 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-ink-muted">Labs</p>
          <NavLink href="/feedback" active={pathname === "/feedback"} icon={<FlaskIcon />}>
            Feedback Insights
          </NavLink>
          <ThemeSwitcher />
          <div className="mt-1 flex items-center gap-1">
            <Link
              href="/profile"
              className={clsx(
                "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 transition",
                pathname === "/profile" ? "bg-accent-light" : "hover:bg-paper"
              )}
              title="Your profile"
            >
              <UserBadge name={user?.username ?? ""} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{user?.username}</span>
                <span className="block truncate text-xs text-ink-muted">{user?.email}</span>
              </span>
            </Link>
            <button type="button" onClick={logout} className="icon-btn" aria-label="Log out" title="Log out">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        eyebrow="Delete chat"
        title={`Delete “${deleteTitle}”?`}
        actions={
          <>
            <button onClick={() => setPendingDelete(null)} disabled={deleting} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={confirmDeleteSession} disabled={deleting} className="btn-danger flex-1">
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        This removes the conversation and its messages. This can&apos;t be undone.
        {deleteError && <p className="mt-3 text-danger">{deleteError}</p>}
      </Modal>
    </>
  );
}
