"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Avatar } from "@/lib/types";
import { avatarImageUrl, submitFeedback } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Markdown, { copyText } from "@/components/chat/Markdown";
import UserBadge from "@/components/UserBadge";
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  RefreshIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "@/components/icons";

export interface DisplayMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  attachedFiles?: { filename: string; kind?: string | null }[];
  streaming?: boolean;
  feedback?: number | null;
  /** Filenames of previously-uploaded files whose content informed this reply. */
  retrievedSources?: string[];
  /** Local-only failed reply: content is the error text. */
  error?: boolean;
  notices?: string[];
  stopped?: boolean;
  truncated?: boolean;
}

// How close to the bottom (px) still counts as "following" the conversation.
const STICK_THRESHOLD = 80;

function AvatarIcon({ avatar }: { avatar: Avatar }) {
  const img = avatarImageUrl(avatar);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">
      {avatar.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={clsx(
        "rounded-md p-1.5 transition disabled:opacity-40",
        active ? "bg-accent-light text-accent" : "text-ink-muted hover:bg-paper hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export default function MessageList({
  messages,
  avatar,
  busy,
  scrollToBottomKey,
  onRegenerate,
}: {
  messages: DisplayMessage[];
  avatar: Avatar;
  busy: boolean;
  /** Change this to force-scroll to the bottom (e.g. when the user sends). */
  scrollToBottomKey: number;
  onRegenerate: () => void;
}) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<number | string | null>(null);

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  }

  // Follow new content only while the user is already at the bottom, so
  // scrolling up to reread isn't yanked back down on every streamed token.
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    stickRef.current = true;
    setShowJump(false);
    scrollToBottom(true);
  }, [scrollToBottomKey]);

  async function handleFeedback(messageId: number | string, rating: number, current: number) {
    if (typeof messageId !== "number") return;
    const next = current === rating ? 0 : rating;
    setFeedbackMap((prev) => ({ ...prev, [messageId]: next }));
    try {
      await submitFeedback(messageId, next);
    } catch {
      setFeedbackMap((prev) => ({ ...prev, [messageId]: current }));
    }
  }

  async function handleCopy(m: DisplayMessage) {
    if (await copyText(m.content)) {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
    }
  }

  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant");

  if (messages.length === 0) {
    const img = avatarImageUrl(avatar);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-ink-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="mb-4 h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-light font-display text-2xl font-semibold text-accent">
            {avatar.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h2 className="font-display text-xl font-semibold text-ink">{avatar.name}</h2>
        {avatar.description && <p className="mt-1 max-w-md text-sm">{avatar.description}</p>}
        <p className="mt-4 text-sm">Say hello to get started.</p>
        {avatar.topic_tags.length > 0 && (
          <div className="mt-3 flex max-w-md flex-wrap justify-center gap-1.5">
            {avatar.topic_tags.map((t) => (
              <span key={t} className="rounded-full bg-surface px-2 py-0.5 font-mono text-[11px]">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" role="log" aria-live="polite" aria-busy={busy}>
          {messages.map((m, index) => {
            const isUser = m.role === "user";
            const current = typeof m.id === "number" ? feedbackMap[m.id] ?? m.feedback ?? 0 : 0;
            const showActions = !isUser && !m.streaming && !m.error;
            const isLastAssistant = index === lastAssistantIndex;
            return (
              <div key={m.id} className={clsx("flex animate-fade-in gap-3", isUser && "flex-row-reverse")}>
                {isUser ? <UserBadge name={user?.username ?? ""} /> : <AvatarIcon avatar={avatar} />}

                <div className={clsx("flex min-w-0 max-w-[85%] flex-col sm:max-w-[78%]", isUser && "items-end")}>
                  <div
                    className={clsx(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      isUser
                        ? "whitespace-pre-wrap bg-accent text-on-accent"
                        : m.error
                          ? "border border-danger/30 bg-danger/5 text-ink"
                          : "border border-line bg-surface text-ink"
                    )}
                  >
                    {m.attachedFiles && m.attachedFiles.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {m.attachedFiles.map((f, i) => (
                          <span
                            key={i}
                            className={clsx(
                              "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs",
                              isUser ? "bg-on-accent/15" : "bg-paper"
                            )}
                          >
                            <FileIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{f.filename}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {m.error ? (
                      <div className="flex items-start gap-2">
                        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                        <span>{m.content}</span>
                      </div>
                    ) : isUser ? (
                      m.content
                    ) : m.content ? (
                      <Markdown text={m.content} />
                    ) : (
                      <span className="inline-flex gap-1 py-1" aria-label={`${avatar.name} is typing`}>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
                      </span>
                    )}
                    {m.streaming && m.content && (
                      <span className="ml-0.5 inline-block animate-pulse text-accent" aria-hidden="true">
                        ▍
                      </span>
                    )}
                  </div>

                  {!isUser && (m.stopped || m.truncated) && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {m.stopped ? "Stopped." : "Reply hit the length limit."}
                    </p>
                  )}
                  {!isUser &&
                    m.notices?.map((n, i) => (
                      <p key={i} className="mt-1 flex items-start gap-1 text-xs text-ink-muted">
                        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent2" />
                        {n}
                      </p>
                    ))}
                  {!isUser && !m.streaming && m.retrievedSources && m.retrievedSources.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                      <BookIcon className="h-3.5 w-3.5" /> Drew on: {m.retrievedSources.join(", ")}
                    </p>
                  )}

                  {m.error && isLastAssistant && (
                    <button
                      type="button"
                      onClick={onRegenerate}
                      disabled={busy}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      <RefreshIcon className="h-3.5 w-3.5" /> Try again
                    </button>
                  )}

                  {showActions && (
                    <div className="mt-1 flex gap-0.5">
                      <ActionButton label={copiedId === m.id ? "Copied" : "Copy reply"} onClick={() => handleCopy(m)}>
                        {copiedId === m.id ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                      </ActionButton>
                      {typeof m.id === "number" && (
                        <>
                          <ActionButton label="Good reply" active={current === 1} onClick={() => handleFeedback(m.id, 1, current)}>
                            <ThumbUpIcon className="h-3.5 w-3.5" />
                          </ActionButton>
                          <ActionButton label="Bad reply" active={current === -1} onClick={() => handleFeedback(m.id, -1, current)}>
                            <ThumbDownIcon className="h-3.5 w-3.5" />
                          </ActionButton>
                        </>
                      )}
                      {isLastAssistant && (
                        <ActionButton label="Regenerate reply" onClick={onRegenerate} disabled={busy}>
                          <RefreshIcon className="h-3.5 w-3.5" />
                        </ActionButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => {
            stickRef.current = true;
            setShowJump(false);
            scrollToBottom(true);
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-toast-in rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-md hover:bg-paper"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
}
