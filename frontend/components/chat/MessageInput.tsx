"use client";

import { useRef, useState } from "react";

export default function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (text: string, files: File[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (disabled) return;
    if (!text.trim() && files.length === 0) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-ink-muted"
              >
                📎 {f.name}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-1 text-ink-muted hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-white px-2 py-2 focus-within:border-accent">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-gray-100"
            title="Attach file"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.py,.js,.ts,.tsx,.jsx,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.cs,.md,.txt,.json,.yaml,.yml,.html,.css,.sql,.sh"
            className="hidden"
            onChange={handleFilePick}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="max-h-40 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent-hover disabled:opacity-40"
            title="Send"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}
