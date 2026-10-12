"use client";

import AvatarForm from "@/components/avatar/AvatarForm";
import PageHeader from "@/components/PageHeader";
import PageScroll from "@/components/PageScroll";

export default function NewAvatarPage() {
  return (
    <PageScroll width="max-w-2xl">
      <PageHeader
        eyebrow="New Cast Member"
        title="Create a New Avatar"
        subtitle="Define your AI persona's personality, expertise, and topics."
      />
      <AvatarForm />
    </PageScroll>
  );
}
