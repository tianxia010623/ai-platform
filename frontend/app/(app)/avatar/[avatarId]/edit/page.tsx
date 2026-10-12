"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import AvatarForm from "@/components/avatar/AvatarForm";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";
import { ChevronIcon, FlaskIcon } from "@/components/icons";
import { useAppData } from "@/lib/app-data";

export default function EditAvatarPage() {
  const params = useParams<{ avatarId: string }>();
  const avatarId = Number(params.avatarId);
  const { avatars, loaded } = useAppData();
  const avatar = avatars.find((a) => a.id === avatarId);

  return (
    <PageScroll width="max-w-2xl">
      <PageHeader
        eyebrow="Edit Cast Member"
        title={avatar ? `Edit ${avatar.name}` : "Edit Avatar"}
        subtitle="Changes apply to new replies; existing conversations are kept."
      />
      {!loaded ? (
        <div className="card h-96 animate-pulse" aria-busy="true" />
      ) : !avatar ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-muted">
          This avatar doesn&apos;t exist anymore.{" "}
          <Link href="/" className="font-medium text-accent hover:underline">
            Back home
          </Link>
        </div>
      ) : (
        <>
          {/* key: remount the form with fresh state if the avatar changes */}
          <AvatarForm key={avatar.id} avatar={avatar} />
          <Link
            href={`/avatar/${avatar.id}/prompt-variants`}
            className="card mt-6 flex items-center gap-3 p-5 transition hover:border-accent"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent2-light text-accent2">
              <FlaskIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Prompt experiments</span>
              <span className="block text-xs text-ink-muted">
                Advanced: A/B test prompt tweaks and let your thumbs-up/down feedback pick the best one.
              </span>
            </span>
            <ChevronIcon className="h-4 w-4 text-ink-muted" />
          </Link>
        </>
      )}
    </PageScroll>
  );
}
