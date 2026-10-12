"use client";

import { useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

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
      setMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm animate-page-in rounded-2xl border border-line bg-surface px-8 py-10 shadow-[0_1px_2px_rgba(20,23,31,0.04),0_8px_24px_rgba(20,23,31,0.06)]">
        <h1 className="mb-1 text-center font-display text-2xl font-semibold text-ink">
          Reset your password
        </h1>
        <p className="mb-8 text-center text-sm text-ink-muted">
          Enter your account email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            required
            className="field"
          />

          {message && (
            <p className={`text-sm ${message.type === "error" ? "text-danger" : "text-success"}`} role="status">
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
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
