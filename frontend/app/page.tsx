"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import AvatarCard from "@/components/avatar/AvatarCard";
import * as api from "@/lib/api";
import type { Avatar } from "@/lib/types";

function HomeContent() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listAvatars()
      .then(setAvatars)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen bg-paper">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent2">
            Your Cast
          </p>
          <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Your Avatars</h1>
          <p className="mb-8 text-sm text-ink-muted">
            Create custom AI personas and chat with them to explore topics.
          </p>

          {loading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : avatars.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
             <p className="mb-4 text-sm text-ink-muted">You haven&apos;t created any avatars yet.</p>
              <a
                href="/avatar/new"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Create your first avatar
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {avatars.map((avatar) => (
                <AvatarCard key={avatar.id} avatar={avatar} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <HomeContent />
    </RequireAuth>
  );
}