"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import type { Avatar, ChatSession } from "./types";

interface AppData {
  avatars: Avatar[];
  sessions: ChatSession[];
  loaded: boolean;
  refreshAvatars: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  upsertAvatar: (avatar: Avatar) => void;
  removeAvatar: (avatarId: number) => void;
  upsertSession: (session: ChatSession) => void;
  patchSession: (sessionId: number, patch: Partial<ChatSession>) => void;
  removeSession: (sessionId: number) => void;
  /** Mobile navigation drawer. */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
}

const AppDataContext = createContext<AppData | undefined>(undefined);

/** Avatars and chat sessions, loaded once for the signed-in area and shared
 * by the sidebar and pages, so navigating doesn't refetch (and flash) them
 * and a change on one page shows up everywhere immediately. */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const refreshAvatars = useCallback(async () => {
    setAvatars(await api.listAvatars());
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessions(await api.listSessions());
  }, []);

  useEffect(() => {
    Promise.all([refreshAvatars(), refreshSessions()])
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [refreshAvatars, refreshSessions]);

  const upsertAvatar = useCallback((avatar: Avatar) => {
    setAvatars((cur) =>
      cur.some((a) => a.id === avatar.id) ? cur.map((a) => (a.id === avatar.id ? avatar : a)) : [avatar, ...cur]
    );
  }, []);

  const removeAvatar = useCallback((avatarId: number) => {
    setAvatars((cur) => cur.filter((a) => a.id !== avatarId));
    setSessions((cur) => cur.filter((s) => s.avatar_id !== avatarId));
  }, []);

  const upsertSession = useCallback((session: ChatSession) => {
    setSessions((cur) =>
      cur.some((s) => s.id === session.id) ? cur.map((s) => (s.id === session.id ? session : s)) : [session, ...cur]
    );
  }, []);

  const patchSession = useCallback((sessionId: number, patch: Partial<ChatSession>) => {
    setSessions((cur) => cur.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)));
  }, []);

  const removeSession = useCallback((sessionId: number) => {
    setSessions((cur) => cur.filter((s) => s.id !== sessionId));
  }, []);

  const value = useMemo(
    () => ({
      avatars,
      sessions,
      loaded,
      refreshAvatars,
      refreshSessions,
      upsertAvatar,
      removeAvatar,
      upsertSession,
      patchSession,
      removeSession,
      navOpen,
      setNavOpen,
    }),
    [avatars, sessions, loaded, refreshAvatars, refreshSessions, upsertAvatar, removeAvatar, upsertSession, patchSession, removeSession, navOpen]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
