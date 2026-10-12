"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";
import * as api from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import type { TopicMastery } from "@/lib/types";

function scoreColor(score: number) {
  if (score >= 0.75) return "bg-success";
  if (score >= 0.4) return "bg-accent";
  return "bg-accent2";
}

export default function DashboardPage() {
  const { avatars } = useAppData();
  const [mastery, setMastery] = useState<TopicMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .getAllMastery()
      .then(setMastery)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const avatarById = new Map(avatars.map((a) => [a.id, a]));
  const grouped = new Map<number, TopicMastery[]>();
  for (const m of mastery) {
    if (!grouped.has(m.avatar_id)) grouped.set(m.avatar_id, []);
    grouped.get(m.avatar_id)!.push(m);
  }

  return (
    <PageScroll width="max-w-4xl">
      <PageHeader
        eyebrow="Progress"
        title="Knowledge Dashboard"
        subtitle="Your mastery of each avatar's topics, updated after every conversation."
      />

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card h-40 animate-pulse" />
          ))}
        </div>
      ) : failed ? (
        <div className="card px-6 py-12 text-center text-sm text-danger">Couldn&apos;t load your progress. Please refresh.</div>
      ) : grouped.size === 0 ? (
        <div className="card animate-fade-in border-dashed px-6 py-16 text-center text-sm text-ink-muted">
          No topic mastery data yet. Chat with an avatar that has topic tags to build your knowledge profile.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([avatarId, topics]) => {
            const avatar = avatarById.get(avatarId);
            return (
              <section key={avatarId} className="card animate-fade-in p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold text-ink">{avatar?.name || `Avatar #${avatarId}`}</h2>
                  {avatar && (
                    <Link href={`/chat/${avatarId}`} className="text-xs font-medium text-accent hover:underline">
                      Continue learning
                    </Link>
                  )}
                </div>
                <div className="space-y-4">
                  {topics
                    .slice()
                    .sort((a, b) => b.mastery_score - a.mastery_score)
                    .map((t) => {
                      const pct = Math.round(t.mastery_score * 100);
                      return (
                        <div key={t.id}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-ink">{t.topic}</span>
                            <span className="shrink-0 text-ink-muted">
                              {pct}% · {t.interaction_count} exchange{t.interaction_count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div
                            className="h-2 w-full overflow-hidden rounded-full bg-paper"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${t.topic} mastery`}
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${scoreColor(t.mastery_score)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {t.last_topics_summary && <p className="mt-1 text-xs text-ink-muted">{t.last_topics_summary}</p>}
                        </div>
                      );
                    })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageScroll>
  );
}
