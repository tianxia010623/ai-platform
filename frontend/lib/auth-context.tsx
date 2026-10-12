"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as api from "./api";
import { clearToken, getToken, setToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Update the cached user profile (e.g. after editing it on /profile)
   * without a full re-login. */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEY = "ai_avatar_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const storedUser = typeof window !== "undefined" ? localStorage.getItem(USER_KEY) : null;
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
      // Refresh the cached profile (e.g. a username changed elsewhere); a
      // stale or revoked token is handled by api.ts's 401 redirect.
      api
        .getMe()
        .then((fresh) => {
          localStorage.setItem(USER_KEY, JSON.stringify(fresh));
          setUser(fresh);
        })
        .catch(() => {});
    }
    setLoading(false);
  }, []);

  async function handleLogin(email: string, password: string) {
    const res = await api.login(email, password);
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }

  // Registration only creates the account; the user is sent back to the
  // login form to sign in explicitly, so the returned token is not kept.
  async function handleRegister(username: string, email: string, password: string) {
    await api.register(username, email, password);
  }

  function handleLogout() {
    clearToken();
    localStorage.removeItem(USER_KEY);
    setUser(null);
    router.push("/login");
  }

  function handleUpdateUser(updated: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    setUser(updated);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        updateUser: handleUpdateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
