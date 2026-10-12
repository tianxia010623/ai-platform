"use client";

import { useState } from "react";
import Link from "next/link";
import AvatarCard from "@/components/avatar/AvatarCard";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";
import Modal from "@/components/ui/Modal";
import { PlusIcon } from "@/components/icons";
import * as api from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/errors";
import type { Avatar } from "@/lib/types";

// Matches the card-out animation duration in tailwind.config.ts.
const CARD_EXIT_MS = 220;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { avatars, loaded, removeAvatar } = useAppData();
  const { user } = useAuth();
  const [pendingDelete, setPendingDelete] = useState<Avatar | null>(null);
  const [dialogName, setDialogName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  function closeDeleteDialog() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAvatar(target.id);
      setPendingDelete(null);
      setRemovingId(target.id);
      setTimeout(() => {
        removeAvatar(target.id);
        setRemovingId(null);
      }, CARD_EXIT_MS);
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete this avatar."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Your Cast"
        title={user ? `${greeting()}, ${user.username}` : "Your Avatars"}
        subtitle="Pick an avatar to keep a conversation going, or cast someone new."
        actions={
          avatars.length > 0 && (
            <Link href="/avatar/new" className="btn-primary py-2">
              <PlusIcon /> New Avatar
            </Link>
          )
        }
      />

      {!loaded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-36 animate-pulse bg-surface/60" />
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <div className="card animate-fade-in border-dashed px-6 py-16 text-center">
          <p className="mb-1 font-display text-lg font-semibold text-ink">Your cast is empty</p>
          <p className="mb-5 text-sm text-ink-muted">
            Create an AI persona with its own personality and expertise, then start talking.
          </p>
          <Link href="/avatar/new" className="btn-primary">
            <PlusIcon /> Create your first avatar
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {avatars.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              onDelete={(a) => {
                setPendingDelete(a);
                setDialogName(a.name);
              }}
              removing={removingId === avatar.id}
            />
          ))}
        </div>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={closeDeleteDialog}
        eyebrow="Remove from cast"
        title={`Delete ${dialogName}?`}
        actions={
          <>
            <button onClick={closeDeleteDialog} disabled={deleting} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={confirmDelete} disabled={deleting} className="btn-danger flex-1">
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        This permanently removes the avatar, all of its chats, and the files it has learned from. This
        can&apos;t be undone.
        {deleteError && <p className="mt-3 text-danger">{deleteError}</p>}
      </Modal>
    </PageScroll>
  );
}
