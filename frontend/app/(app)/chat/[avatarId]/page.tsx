"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MessageList, { type DisplayMessage } from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import { AlertIcon, CloseIcon, PencilIcon } from "@/components/icons";
import * as api from "@/lib/api";
import { ApiError, avatarImageUrl, type StreamEvent } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { errorMessage } from "@/lib/errors";
import type { Avatar, Message } from "@/lib/types";

function toDisplay(m: Message): DisplayMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    attachedFiles: m.attached_files,
    feedback: m.user_feedback,
  };
}

export default function ChatPage() {
  const params = useParams<{ avatarId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const avatarId = Number(params.avatarId);
  const sessionParam = Number(searchParams.get("session")) || null;
  const isNewChat = searchParams.get("new") === "1";

  const { avatars, sessions, loaded, upsertSession, patchSession } = useAppData();
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [avatarMissing, setAvatarMissing] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  // Session we just created while sending; its URL change must not reload
  // messages over the reply that is still streaming in.
  const createdSessionRef = useRef<number | null>(null);
  const streamCounter = useRef(0);
  const sessionIdRef = useRef<number | null>(null);
  sessionIdRef.current = sessionId;

  // Avatar: from the shared list, or fetched directly if not there yet.
  useEffect(() => {
    const fromList = avatars.find((a) => a.id === avatarId);
    if (fromList) {
      setAvatar(fromList);
      setAvatarMissing(false);
    } else if (loaded) {
      api
        .getAvatar(avatarId)
        .then(setAvatar)
        .catch(() => setAvatarMissing(true));
    }
  }, [avatarId, avatars, loaded]);

  // Stop any in-flight reply when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Resolve which conversation to show. Opening an avatar shows its latest
  // chat; "New chat" (and avatars with no chats) start an unsaved draft --
  // the session is only created once the first message is sent.
  useEffect(() => {
    if (!loaded) return;
    if (sessionParam && createdSessionRef.current === sessionParam) {
      createdSessionRef.current = null;
      return;
    }
    // Switching to a different conversation stops the reply in progress.
    abortRef.current?.abort();
    let cancelled = false;
    setBanner(null);

    if (sessionParam) {
      setLoadingMessages(true);
      setSessionId(sessionParam);
      api
        .getSessionMessages(sessionParam)
        .then((history) => {
          if (!cancelled) setMessages(history.map(toDisplay));
        })
        .catch(() => {
          if (!cancelled) router.replace(`/chat/${avatarId}`);
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingMessages(false);
            setScrollKey((k) => k + 1);
          }
        });
    } else {
      const latest = isNewChat ? undefined : sessions.find((s) => s.avatar_id === avatarId);
      if (latest) {
        router.replace(`/chat/${avatarId}?session=${latest.id}`);
        return;
      }
      setSessionId(null);
      setMessages([]);
      setLoadingMessages(false);
    }
    return () => {
      cancelled = true;
    };
    // sessions intentionally omitted: only re-resolve when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId, sessionParam, isNewChat, loaded]);

  const updateMessage = useCallback((id: number | string, patch: Partial<DisplayMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  async function runStream(
    sid: number,
    assistantId: string,
    request: { message?: string; files?: File[]; regenerate?: boolean },
    localUserId?: string
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let currentId: number | string = assistantId;
    try {
      await api.streamChat({ sessionId: sid, ...request, signal: controller.signal }, (event: StreamEvent) => {
        switch (event.type) {
          case "user_saved":
            if (localUserId) updateMessage(localUserId, { id: event.message_id });
            break;
          case "delta":
            setMessages((prev) =>
              prev.map((m) => (m.id === currentId ? { ...m, content: m.content + event.content } : m))
            );
            break;
          case "notice":
            setMessages((prev) =>
              prev.map((m) => (m.id === currentId ? { ...m, notices: [...(m.notices ?? []), event.message] } : m))
            );
            break;
          case "message_done":
            updateMessage(currentId, {
              id: event.message_id,
              streaming: false,
              retrievedSources: event.retrieved_sources,
              truncated: event.truncated,
            });
            currentId = event.message_id;
            if (event.session_title) patchSession(sid, { title: event.session_title });
            // The reply is complete: unlock input right away rather than
            // waiting for the stream to close.
            setBusy(false);
            break;
          case "error":
            updateMessage(currentId, { content: event.message, error: true, streaming: false });
            break;
        }
      });
    } catch (err) {
      if (controller.signal.aborted) {
        updateMessage(currentId, { streaming: false, stopped: true });
        // The server keeps whatever was written before the stop; pick up its
        // real id so feedback and regenerate work on it.
        setTimeout(() => {
          if (sessionIdRef.current !== sid) return;
          api
            .getSessionMessages(sid)
            .then((history) =>
              setMessages((prev) => {
                const display = history.map(toDisplay);
                const last = display[display.length - 1];
                return last?.role === "assistant"
                  ? display.map((m, i) => (i === display.length - 1 ? { ...m, stopped: true } : m))
                  : prev;
              })
            )
            .catch(() => {});
        }, 700);
      } else if (err instanceof ApiError) {
        // Rejected before anything was saved (e.g. a disallowed file).
        setMessages((prev) => prev.filter((m) => m.id !== currentId && m.id !== localUserId));
        setBanner(`Message not sent: ${err.message}`);
      } else {
        updateMessage(currentId, { content: errorMessage(err), error: true, streaming: false });
      }
    } finally {
      setMessages((prev) => prev.map((m) => (m.id === currentId && m.streaming ? { ...m, streaming: false } : m)));
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function handleSend(text: string, files: File[]) {
    if (busy || !avatar) return;
    setBanner(null);

    let sid = sessionId;
    if (!sid) {
      try {
        const created = await api.createSession(avatar.id);
        upsertSession(created);
        sid = created.id;
        setSessionId(sid);
        createdSessionRef.current = sid;
        router.replace(`/chat/${avatar.id}?session=${sid}`);
      } catch (err) {
        setBanner(`Couldn't start a new chat: ${errorMessage(err)}`);
        return;
      }
    }

    const n = ++streamCounter.current;
    const localUserId = `local-user-${n}`;
    const assistantId = `stream-${n}`;
    setMessages((prev) => [
      ...prev,
      {
        id: localUserId,
        role: "user",
        content: text,
        attachedFiles: files.map((f) => ({ filename: f.name })),
      },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setScrollKey((k) => k + 1);
    await runStream(sid, assistantId, { message: text, files }, localUserId);
  }

  async function handleRegenerate() {
    if (busy || !sessionId) return;
    setBanner(null);
    const assistantId = `stream-${++streamCounter.current}`;
    setMessages((prev) => {
      const trimmed = prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev;
      return [...trimmed, { id: assistantId, role: "assistant", content: "", streaming: true }];
    });
    setScrollKey((k) => k + 1);
    await runStream(sessionId, assistantId, { regenerate: true });
  }

  if (avatarMissing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-ink-muted">
        <p>This avatar doesn&apos;t exist anymore.</p>
        <Link href="/" className="font-medium text-accent hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  if (!avatar) {
    return <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">Loading conversation...</div>;
  }

  const img = avatarImageUrl(avatar);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
              {avatar.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold text-ink">{avatar.name}</h1>
            {avatar.expertise && <p className="truncate text-xs text-ink-muted">{avatar.expertise}</p>}
          </div>
        </div>
        <Link href={`/avatar/${avatar.id}/edit`} className="icon-btn" aria-label={`Edit ${avatar.name}`} title="Edit avatar">
          <PencilIcon />
        </Link>
      </header>

      {loadingMessages ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">Loading conversation...</div>
      ) : (
        <MessageList
          messages={messages}
          avatar={avatar}
          busy={busy}
          scrollToBottomKey={scrollKey}
          onRegenerate={handleRegenerate}
        />
      )}

      {banner && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl animate-toast-in items-start gap-2 px-4">
          <div className="flex flex-1 items-start gap-2 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm text-ink" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span className="flex-1">{banner}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-ink-muted hover:text-ink" aria-label="Dismiss">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <MessageInput onSend={handleSend} onStop={() => abortRef.current?.abort()} busy={busy} disabled={loadingMessages} />
    </div>
  );
}
