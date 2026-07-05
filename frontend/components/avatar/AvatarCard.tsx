"use client";

import Link from "next/link";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar } from "@/lib/types";

export default function AvatarCard({ avatar }: { avatar: Avatar }) {
  const img = avatarImageUrl(avatar);

  return (
    <Link
      href={`/chat/${avatar.id}`}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition hover:border-accent hover:shadow-sm"
    >
      <div className="mb-3 flex items-center gap-3">
        {img ? (
          <img src={img} alt={avatar.name} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-lg font-semibold text-accent">
            {avatar.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink group-hover:text-accent">{avatar.name}</h3>
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
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-ink-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
