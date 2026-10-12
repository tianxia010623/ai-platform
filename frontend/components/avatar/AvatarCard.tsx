"use client";

import Link from "next/link";
import clsx from "clsx";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar } from "@/lib/types";
import { PencilIcon, TrashIcon } from "@/components/icons";

export default function AvatarCard({
  avatar,
  onDelete,
  removing = false,
}: {
  avatar: Avatar;
  /** Shows a delete button; the parent handles confirmation. */
  onDelete?: (avatar: Avatar) => void;
  /** Plays the exit animation while the parent removes the card. */
  removing?: boolean;
}) {
  const img = avatarImageUrl(avatar);

  return (
    <div className={clsx("group relative", removing && "pointer-events-none animate-card-out")}>
      <Link
        href={`/chat/${avatar.id}`}
        className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_8px_24px_rgba(20,23,31,0.08)]"
      >
        <div className="mb-3 flex items-center gap-3 pr-16">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-accent-light" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light font-display text-lg font-semibold text-accent ring-2 ring-accent-light">
              {avatar.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-ink group-hover:text-accent">
              {avatar.name}
            </h3>
            {avatar.expertise && <p className="truncate text-xs text-ink-muted">{avatar.expertise}</p>}
          </div>
        </div>

        {avatar.description && <p className="mb-3 line-clamp-2 text-sm text-ink-muted">{avatar.description}</p>}

        {avatar.topic_tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {avatar.topic_tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>

      <div className="absolute right-3 top-3 flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <Link
          href={`/avatar/${avatar.id}/edit`}
          aria-label={`Edit ${avatar.name}`}
          title="Edit avatar"
          className="icon-btn"
        >
          <PencilIcon />
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(avatar)}
            aria-label={`Delete ${avatar.name}`}
            title="Delete avatar"
            className="icon-btn hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}
