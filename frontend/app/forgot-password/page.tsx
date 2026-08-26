"use client";

import { useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await api.forgotPassword(email);
      setMessage({ type: "ok", text: res.message });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface px-8 py-10 shadow-[0_1px_2px_rgba(20,23,31,0.04),0_8px_24px_rgba(20,23,31,0.06)]">
        <h1 className="mb-1 text-center font-display text-2xl font-semibold text-ink">
          Reset your password
        </h1>
        <p className="mb-8 text-center text-sm text-ink-muted">
          Enter your account email and we'll send you a reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            required
            className="w-full rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20"
          />

          {message && (
            <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-emerald-600"}`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
