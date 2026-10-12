"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/errors";
import Modal from "@/components/ui/Modal";

const MIN_USERNAME = 3;
const MIN_PASSWORD = 6;

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRegistered, setShowRegistered] = useState(false);
  const [registeredName, setRegisteredName] = useState("");

  const { login, register, user, loading } = useAuth();
  const router = useRouter();

  // Already signed in: skip the form.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  function validate(): string | null {
    if (!email.trim()) return "Please enter your email.";
    if (mode === "register") {
      if (username.trim().length < MIN_USERNAME) return `Username must be at least ${MIN_USERNAME} characters.`;
      if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    } else if (!password) {
      return "Please enter your password.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        router.push("/");
      } else {
        await register(username.trim(), email.trim(), password);
        setRegisteredName(username.trim());
        setShowRegistered(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setPassword("");
  }

  // Close the success dialog and drop the user back on the login form with
  // their new email prefilled.
  function backToLogin() {
    setShowRegistered(false);
    setUsername("");
    switchMode("login");
  }

  const isRegister = mode === "register";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm animate-page-in rounded-2xl border border-line bg-surface px-6 py-10 shadow-[0_1px_2px_rgba(20,23,31,0.04),0_8px_24px_rgba(20,23,31,0.06)] sm:px-8">
        <p className="eyebrow mb-2 text-center">Call Sheet</p>
        <h1 className="mb-1 text-center font-display text-3xl font-semibold text-ink">AI Avatars</h1>
        <p key={`sub-${mode}`} className="mb-8 animate-fade-in text-center text-sm text-ink-muted">
          {isRegister ? "Create an account" : "Log in with your email"}
        </p>

        <form key={mode} onSubmit={handleSubmit} className="animate-fade-in space-y-4" noValidate>
          {isRegister && (
            <div>
              <label htmlFor="username" className="mb-1 block text-xs font-medium text-ink-muted">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                minLength={MIN_USERNAME}
                maxLength={64}
                className="field"
              />
              <p className="mt-1 text-[11px] text-ink-muted">Shown across the app. At least {MIN_USERNAME} characters.</p>
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-muted">
              Email
            </label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              autoFocus={!isRegister}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-muted">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? MIN_PASSWORD : undefined}
                className="field pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-[11px] font-medium text-ink-muted hover:text-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {isRegister && <p className="mt-1 text-[11px] text-ink-muted">At least {MIN_PASSWORD} characters.</p>}
          </div>

          {!isRegister && (
            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-ink-muted hover:text-accent">
                Forgot password?
              </Link>
            </div>
          )}

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Please wait..." : isRegister ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => switchMode(isRegister ? "login" : "register")} className="font-medium text-accent hover:underline">
            {isRegister ? "Log in" : "Sign up"}
          </button>
        </p>
      </div>

      <Modal
        open={showRegistered}
        onClose={backToLogin}
        eyebrow="You're on the list"
        title="Account created"
        actions={
          <button onClick={backToLogin} autoFocus className="btn-primary w-full">
            Go to log in
          </button>
        }
      >
        Welcome, <span className="font-medium text-ink">{registeredName}</span>. Log in with{" "}
        <span className="font-medium text-ink">{email}</span> to continue.
      </Modal>
    </div>
  );
}
