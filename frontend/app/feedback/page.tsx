"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import * as api from "@/lib/api";
import type { FeedbackSummary } from "@/lib/types";

function FeedbackContent() {
  const [summary, setSummary] = useState<FeedbackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getFeedbackSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  const totalAll = summary.reduce((sum, s) => sum + s.total, 0);
  const upAll = summary.reduce((sum, s) => sum + s.thumbs_up, 0);
  const overallRate = totalAll > 0 ? Math.round((upAll / totalAll) * 100) : null;

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-2xl font-semibold text-ink">Feedback Overview</h1>
          <p className="mb-8 text-sm text-ink-muted">
            See how your avatars' responses are being received, based on real user feedback.
          </p>

          {loading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : summary.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-ink-muted">
              No feedback yet. Rate a few responses in chat to see stats here.
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-xl border border-gray-200 p-5">
                <h2 className="mb-2 text-sm font-medium text-ink-muted">Overall</h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-semibold text-ink">
                    {overallRate !== null ? `${overallRate}%` : "—"}
                  </span>
                  <span className="text-sm text-ink-muted">
                    approval across {totalAll} rated response{totalAll === 1 ? "" : "s"}
                  </span>
                </div>
              </section>

              <div className="space-y-4">
                {summary
                  .sort((a, b) => b.total - a.total)
                  .map((s) => (
                    <section key={s.avatar_id} className="rounded-xl border border-gray-200 p-5">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-ink">{s.avatar_name}</h3>
                        <span className="text-sm text- ink-muted">
                          {s.approval_rate !== null ? `${Math.round(s.approval_rate * 100)}%` : "—"}
                        </span>
                      </div>
                      <div className="flex gap-4 text-sm text-ink-muted">
                        <span>👍 {s.thumbs_up}</span>
                        <span>👎 {s.thumbs_down}</span>
                        <span>{s.total} total</span>
                      </div>
                    </section>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <RequireAuth>
      <FeedbackContent />
    </RequireAuth>
  );
}
