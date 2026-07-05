"use client";

import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import CreateForm from "@/components/avatar/CreateForm";

function NewAvatarContent() {
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <h1 className="mx-auto mb-1 max-w-2xl text-2xl font-semibold text-ink">Create a New Avatar</h1>
        <p className="mx-auto mb-8 max-w-2xl text-sm text-ink-muted">
          Define your AI persona&apos;s personality, expertise, and topics.
        </p>
        <CreateForm />
      </main>
    </div>
  );
}

export default function NewAvatarPage() {
  return (
    <RequireAuth>
      <NewAvatarContent />
    </RequireAuth>
  );
}
