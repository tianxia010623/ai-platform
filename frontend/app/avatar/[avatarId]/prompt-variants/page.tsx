"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar, PromptVariant } from "@/lib/types";

function approvalLabel(v: PromptVariant): string {
  // No feedback yet: alpha/beta still at the 1/1 prior, so the ratio is
  // meaningless as an approval rate — show a dash instead of a fake 50%.
  if (v.times_shown === 0) return "—";
  return `${Math.round(v.estimated_win_rate * 100)}%`;
}

function VariantCard({
  variant,
  onToggle,
  toggling,
}: {
  variant: PromptVariant;
  onToggle: (v: PromptVariant) => void;
  toggling: boolean;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{variant.name}</h3>
            {variant.is_baseline && (
              <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                Baseline
              </span>
            )}
          </div>
          {variant.prompt_modifier ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{variant.prompt_modifier}</p>
          ) : (
            <p className="mt-1 text-sm italic text-ink-muted">No changes — original prompt as-is.</p>
          )}
        </div>
        <button
          onClick={() => onToggle(variant)}
          disabled={toggling}
          className={clsx(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50",
            variant.is_active
              ? "bg-accent-light text-accent hover:bg-accent-light/70"
              : "bg-paper text-ink-muted hover:bg-line"
          )}
        >
          {variant.is_active ? "Active" : "Disabled"}
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-3 border-t border-line pt-3">
        <span className="text-2xl font-semibold text-ink">{approvalLabel(variant)}</span>
        <span className="text-sm text-ink-muted">
          好评率 (approval rate)
          {variant.times_shown > 0 && ` · ${variant.times_shown} shown`}
        </span>
      </div>
      <div className="mt-1 flex gap-4 text-sm text-ink-muted">
        <span>👍 {variant.times_positive}</span>
        <span>👎 {variant.times_negative}</span>
      </div>
    </section>
  );
}

function NewVariantForm({
  onCreate,
  creating,
}: {
  onCreate: (name: string, promptModifier: string) => Promise<void>;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [promptModifier, setPromptModifier] = useState("");
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !promptModifier.trim()) return;
    await onCreate(name.trim(), promptModifier.trim());
    setName("");
    setPromptModifier("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line py-4 text-sm font-medium text-ink-muted hover:border-accent hover:text-accent"
      >
        + New prompt variant
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. More playful tone"
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
          Prompt addition
        </label>
        <textarea
          value={promptModifier}
          onChange={(e) => setPromptModifier(e.target.value)}
          rows={4}
          placeholder="Appended to the avatar's system prompt when this variant is chosen..."
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={creating || !name.trim() || !promptModifier.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create variant"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-paper"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PromptVariantsContent() {
  const params = useParams<{ avatarId: string }>();
  const avatarId = Number(params.avatarId);

  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [variants, setVariants] = useState<PromptVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAvatar(avatarId).then(setAvatar).catch(() => setAvatar(null));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId]);

  function refresh() {
    setLoading(true);
    api
      .listPromptVariants(avatarId)
      .then(setVariants)
      .catch(() => setError("Couldn't load prompt variants."))
      .finally(() => setLoading(false));
  }

  async function handleCreate(name: string, promptModifier: string) {
    setCreating(true);
    setError(null);
    try {
      const created = await api.createPromptVariant(avatarId, name, promptModifier);
      setVariants((prev) => [...prev, created]);
      // Creating the first variant for an avatar also auto-creates a
      // baseline on the backend, so re-fetch to pick that up too.
      refresh();
    } catch {
      setError("Couldn't create variant. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(variant: PromptVariant) {
    setTogglingId(variant.id);
    setError(null);
    try {
      const updated = await api.setPromptVariantActive(avatarId, variant.id, !variant.is_active);
      setVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch {
      setError("Couldn't update variant. Try again.");
    } finally {
      setTogglingId(null);
    }
  }

  const img = avatar ? avatarImageUrl(avatar) : null;

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeAvatarId={avatarId} />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-1 flex items-center gap-3">
            {avatar &&
              (img ? (
                <img src={img} alt={avatar.name} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                  {avatar.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            <h1 className="text-2xl font-semibold text-ink">
              Prompt Variants{avatar ? ` — ${avatar.name}` : ""}
            </h1>
          </div>
          <p className="mb-2 text-sm text-ink-muted">
            Try different system-prompt tweaks and let real feedback pick a winner. Every reply is
            served by one variant, chosen with Thompson Sampling; 👍/👎 on that reply updates its
            odds of being picked again.
          </p>
          {avatar && (
            <Link href={`/chat/${avatarId}`} className="mb-6 inline-block text-sm text-accent hover:text-accent-hover">
              ← Back to chat
            </Link>
          )}
          {!avatar && <div className="mb-6" />}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : (
            <div className="space-y-4">
              {variants.length === 0 && (
                <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-muted">
                  No prompt variants yet. Create one below to start A/B testing prompts — a
                  "Baseline" variant with the original prompt is added automatically for
                  comparison.
                </div>
              )}
              {variants
                .slice()
                .sort((a, b) => Number(b.is_baseline) - Number(a.is_baseline) || b.times_shown - a.times_shown)
                .map((v) => (
                  <VariantCard
                    key={v.id}
                    variant={v}
                    onToggle={handleToggle}
                    toggling={togglingId === v.id}
                  />
                ))}
              <NewVariantForm onCreate={handleCreate} creating={creating} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function PromptVariantsPage() {
  return (
    <RequireAuth>
      <PromptVariantsContent />
    </RequireAuth>
  );
}
