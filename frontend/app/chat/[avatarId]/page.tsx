"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import MessageList, { DisplayMessage } from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import type { Avatar } from "@/lib/types";

function ChatContent() {
  const params = useParams<{ avatarId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const avatarId = Number(params.avatarId);

  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sessionsRefreshSignal, setSessionsRefreshSignal] = useState(0);
  const streamingIdRef = useRef(0);

  // Load avatar
  useEffect(() => {
    api.getAvatar(avatarId).then(setAvatar).catch(() => setAvatar(null));
  }, [avatarId]);

  // Resolve or create session
  useEffect(() => {
    let cancelled = false;
    async function resolveSession() {
      setInitializing(true);
      const sessionParam = searchParams.get("session");
      let sid = sessionParam ? Number(sessionParam) : null;

      if (!sid) {
        const sessions = await api.listSessions(avatarId);
        if (sessions.length > 0) {
          sid = sessions[0].id;
        } else {
          const created = await api.createSession(avatarId);
          sid = created.id;
        }
        if (!cancelled) {
          router.replace(`/chat/${avatarId}?session=${sid}`);
        }
      }

      if (!cancelled && sid) {
        setSessionId(sid);
        const history = await api.getSessionMessages(sid);
        setMessages(
          history.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachedFiles: m.attached_files,
            feedback: m.user_feedback,
          }))
        );
      }
      if (!cancelled) setInitializing(false);
    }
    resolveSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId, searchParams.get("session")]);

  async function handleSend(text: string, files: File[]) {
    if (!sessionId) return;
    const wasFirstMessage = messages.length === 0;
    setSending(true);

    const userMsgId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: text,
        attachedFiles: files.map((f) => ({ filename: f.name })),
      },
    ]);

    const assistantId = `stream-${++streamingIdRef.current}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", streaming: true }]);

    try {
      await api.streamChat(sessionId, text, files, (event) => {
        if (event.type === "delta") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.content } : m))
          );
        } else if (event.type === "message_done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    id: event.message_id,
                    streaming: false,
                    retrievedSources: event.retrieved_sources,
                  }
                : m
            )
          );
          if (wasFirstMessage) {
            // The backend just auto-named this session from the first
            // message; tell the sidebar to refetch so it shows up there
            // instead of staying "New Chat".
            setSessionsRefreshSignal((n) => n + 1);
          }
        } else if (event.type === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || `Error: ${event.message}`, streaming: false }
                : m
            )
          );
        }
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || "Something went wrong. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  if (!avatar || initializing) {
    return (
      <div className="flex h-screen bg-white">
        <Sidebar activeAvatarId={avatarId} refreshSignal={sessionsRefreshSignal} />
        <main className="flex flex-1 items-center justify-center text-sm text-ink-muted">
          Loading conversation...
        </main>
      </div>
    );
  }

  const img = avatarImageUrl(avatar);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeAvatarId={avatarId} refreshSignal={sessionsRefreshSignal} />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            {img ? (
              <img src={img} alt={avatar.name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                {avatar.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="text-sm font-semibold text-ink">{avatar.name}</h1>
              {avatar.expertise && <p className="text-xs text-ink-muted">{avatar.expertise}</p>}
            </div>
          </div>
          <Link
            href={`/avatar/${avatarId}/prompt-variants`}
            className="text-xs font-medium text-ink-muted hover:text-accent"
          >
            Prompt Variants
          </Link>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <MessageList messages={messages} avatar={avatar} />
        </div>

        <MessageInput onSend={handleSend} disabled={sending} />
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatContent />
    </RequireAuth>
  );
}
