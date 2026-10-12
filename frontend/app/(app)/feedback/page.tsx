"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";
import { ThumbDownIcon, ThumbUpIcon } from "@/components/icons";
import * as api from "@/lib/api";
import type { FeedbackSummary } from "@/lib/types";

export default function FeedbackPage() {
  const [summary, setSummary] = useState<FeedbackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .getFeedbackSummary()
      .then(setSummary)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const totalAll = summary.reduce((sum, s) => sum + s.total, 0);
  const upAll = summary.reduce((sum, s) => sum + s.thumbs_up, 0);
  const overallRate = totalAll > 0 ? Math.round((upAll / totalAll) * 100) : null;

  return (
    <PageScroll width="max-w-4xl">
      <PageHeader
        eyebrow="Labs"
        title="Feedback Insights"
        subtitle="How your avatars' replies are landing, based on your thumbs-up and thumbs-down ratings in chat."
      />

      {loading ? (
        <div className="card h-32 animate-pulse" aria-busy="true" />
      ) : failed ? (
        <div className="card px-6 py-12 text-center text-sm text-danger">Couldn&apos;t load feedback. Please refresh.</div>
      ) : summary.length === 0 ? (
        <div className="card animate-fade-in border-dashed px-6 py-16 text-center text-sm text-ink-muted">
          No feedback yet. Rate a few replies in chat to see how each avatar is doing.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="card animate-fade-in p-5">
            <h2 className="mb-2 text-sm font-medium text-ink-muted">Overall approval</h2>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl font-semibold text-ink">
                {overallRate !== null ? `${overallRate}%` : "—"}
              </span>
              <span className="text-sm text-ink-muted">
                across {totalAll} rated repl{totalAll === 1 ? "y" : "ies"}
              </span>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            {summary
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((s) => (
                <section key={s.avatar_id} className="card animate-fade-in p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-ink">{s.avatar_name}</h3>
                    <span className="font-display text-lg font-semibold text-ink">
                      {s.approval_rate !== null ? `${Math.round(s.approval_rate * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <ThumbUpIcon className="h-3.5 w-3.5" /> {s.thumbs_up}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbDownIcon className="h-3.5 w-3.5" /> {s.thumbs_down}
                    </span>
                    <span>{s.total} total</span>
                  </div>
                  <Link
                    href={`/avatar/${s.avatar_id}/prompt-variants`}
                    className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
                  >
                    Prompt experiments →
                  </Link>
                </section>
              ))}
          </div>
        </div>
      )}
    </PageScroll>
  );
}
