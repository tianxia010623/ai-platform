"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import * as api from "@/lib/api";
import type { Avatar, TopicMastery } from "@/lib/types";

function scoreColor(score: number) {
  if (score >= 0.75) return "bg-emerald-500";
  if (score >= 0.4) return "bg-accent";
  return "bg-amber-500";
}

function DashboardContent() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [mastery, setMastery] = useState<TopicMastery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listAvatars(), api.getAllMastery()])
      .then(([a, m]) => {
        setAvatars(a);
        setMastery(m);
      })
      .finally(() => setLoading(false));
  }, []);

  const avatarById = new Map(avatars.map((a) => [a.id, a]));
  const grouped = new Map<number, TopicMastery[]>();
  for (const m of mastery) {
    if (!grouped.has(m.avatar_id)) grouped.set(m.avatar_id, []);
    grouped.get(m.avatar_id)!.push(m);
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-2xl font-semibold text-ink">Knowledge Dashboard</h1>
          <p className="mb-8 text-sm text-ink-muted">
            Track your topic mastery across all your AI avatar conversations.
          </p>

          {loading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : grouped.size === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-ink-muted">
              No topic mastery data yet. Start chatting with an avatar to build your knowledge profile.
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(grouped.entries()).map(([avatarId, topics]) => {
                const avatar = avatarById.get(avatarId);
                return (
                  <section key={avatarId} className="rounded-xl border border-gray-200 p-5">
                    <h2 className="mb-4 text-base font-semibold text-ink">
                      {avatar?.name || `Avatar #${avatarId}`}
                    </h2>
                    <div className="space-y-4">
                      {topics
                        .sort((a, b) => b.mastery_score - a.mastery_score)
                        .map((t) => (
                          <div key={t.id}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-medium text-ink">{t.topic}</span>
                              <span className="text-ink-muted">
                                {Math.round(t.mastery_score * 100)}% · {t.interaction_count} exchange
                                {t.interaction_count === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full transition-all ${scoreColor(t.mastery_score)}`}
                                style={{ width: `${Math.round(t.mastery_score * 100)}%` }}
                              />
                            </div>
                            {t.last_topics_summary && (
                              <p className="mt-1 text-xs text-ink-muted">{t.last_topics_summary}</p>
                            )}
                          </div>
                        ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
