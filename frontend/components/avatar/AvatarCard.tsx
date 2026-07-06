"use client";

import Link from "next/link";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar } from "@/lib/types";

export default function AvatarCard({ avatar }: { avatar: Avatar }) {
  const img = avatarImageUrl(avatar);

  return (
    <Link
      href={`/chat/${avatar.id}`}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_8px_24px_rgba(20,23,31,0.08)]"
    >
      <div className="mb-3 flex items-center gap-3">
        {img ? (
          <img
            src={img}
            alt={avatar.name}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-accent-light"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light font-display text-lg font-semibold text-accent ring-2 ring-accent-light">
            {avatar.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-ink group-hover:text-accent">
            {avatar.name}
          </h3>
          {avatar.expertise && (
            <p className="truncate text-xs text-ink-muted">{avatar.expertise}</p>
          )}
        </div>
      </div>

      {avatar.description && (
        <p className="mb-3 line-clamp-2 text-sm text-ink-muted">{avatar.description}</p>
      )}

      {avatar.topic_tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {avatar.topic_tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}