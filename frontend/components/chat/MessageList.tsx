"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { Avatar } from "@/lib/types";
import { avatarImageUrl } from "@/lib/api";
import { submitFeedback } from "@/lib/api";
import { useState } from "react";
export interface DisplayMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  attachedFiles?: { filename: string }[];
  streaming?: boolean;
  feedback?: number | null;
}

export default function MessageList({
  messages,
  avatar,
}: {
  messages: DisplayMessage[];
  avatar: Avatar;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const img = avatarImageUrl(avatar);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, number>>({});

  async function handleFeedback(messageId: number | string, rating: number) {
    if (typeof messageId !== "number") return;
    const current = feedbackMap[messageId];
    const next = current === rating ? 0 : rating;
    setFeedbackMap((prev) => ({ ...prev, [messageId]: next }));
    try {
      await submitFeedback(messageId, next);
    } catch {
      // revert on failure
      setFeedbackMap((prev) => ({ ...prev, [messageId]: current ?? 0 }));
    }
  }
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-ink-muted">
        {img ? (
          <img src={img} alt={avatar.name} className="mb-4 h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-light text-2xl font-semibold text-accent">
            {avatar.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h2 className="text-lg font-medium text-ink">{avatar.name}</h2>
        {avatar.description && <p className="mt-1 max-w-md text-sm">{avatar.description}</p>}
        <p className="mt-4 text-sm">Say hello to get started.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
      {messages.map((m) => (
        <div key={m.id} className={clsx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
          {m.role === "assistant" ? (
            img ? (
              <img src={img} alt={avatar.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">
                {avatar.name.slice(0, 1).toUpperCase()}
              </span>
            )
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              You
            </span>
          )}

          <div
            className={clsx(
              "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
              m.role === "user" ? "bg-accent text-white" : "bg-gray-100 text-ink"
            )}
          >
            {m.attachedFiles && m.attachedFiles.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {m.attachedFiles.map((f, i) => (
                  <span
                    key={i}
                    className={clsx(
                      "rounded-md px-2 py-0.5 text-xs",
                      m.role === "user" ? "bg-white/20" : "bg-white"
                    )}
                  >
                    📎 {f.filename}
                  </span>
                ))}
              </div>
            )}
            {m.content}
            {m.streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
            {m.role === "assistant" && !m.streaming && typeof m.id === "number" && (
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => handleFeedback(m.id, 1)}
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-xs transition",
                    feedbackMap[m.id] === 1 ? "bg-accent text-white" : "text-ink-muted hover:bg-white"
                  )}
                >
                  👍
                </button>
                <button
                  onClick={() => handleFeedback(m.id, -1)}
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-xs transition",
                    feedbackMap[m.id] === -1 ? "bg-accent text-white" : "text-ink-muted hover:bg-white"
                  )}
                >
                  👎
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
