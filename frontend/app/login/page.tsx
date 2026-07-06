"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, register } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface px-8 py-10 shadow-[0_1px_2px_rgba(20,23,31,0.04),0_8px_24px_rgba(20,23,31,0.06)]">
        <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-accent2">
          Call Sheet
        </p>
        <h1 className="mb-1 text-center font-display text-3xl font-semibold text-ink">
          AI Avatars
        </h1>
        <p className="mb-8 text-center text-sm text-ink-muted">
          {mode === "login" ? "Log in to continue" : "Create an account"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20"
          />
          {mode === "register" && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20"
            />
          )}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="w-full rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="font-medium text-accent hover:underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}