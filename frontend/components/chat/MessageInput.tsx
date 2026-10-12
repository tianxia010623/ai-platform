"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { CloseIcon, FileIcon, PaperclipIcon, SendIcon, StopIcon } from "@/components/icons";

// Keep in sync with backend/core/uploads.py and core/config.py.
const ACCEPTED_EXTENSIONS = [
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp", ".go", ".rs", ".rb", ".php", ".cs",
  ".swift", ".kt", ".sql", ".sh", ".json", ".yaml", ".yml", ".md", ".txt", ".html", ".css", ".xml", ".csv",
];
const MAX_FILE_MB = 20;
const MAX_FILES = 5;

function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export default function MessageInput({
  onSend,
  onStop,
  busy,
  disabled,
}: {
  onSend: (text: string, files: File[]) => void;
  onStop: () => void;
  /** A reply is streaming: show the stop button instead of send. */
  busy: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const f of picked) {
      if (!ACCEPTED_EXTENSIONS.includes(extensionOf(f.name))) problems.push(`“${f.name}” isn't a supported file type.`);
      else if (f.size > MAX_FILE_MB * 1024 * 1024) problems.push(`“${f.name}” is larger than ${MAX_FILE_MB} MB.`);
      else accepted.push(f);
    }
    const next = [...files, ...accepted];
    if (next.length > MAX_FILES) problems.push(`You can attach up to ${MAX_FILES} files per message.`);
    setFiles(next.slice(0, MAX_FILES));
    setFileError(problems.length ? problems.join(" ") : null);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  function resetHeight() {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy || disabled) return;
    if (!text.trim() && files.length === 0) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
    setFileError(null);
    resetHeight();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: don't send while an IME (e.g. Chinese pinyin) is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);

  return (
    <div
      className="border-t border-line bg-surface px-3 py-3 sm:px-4"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-full animate-fade-in items-center gap-1 rounded-md bg-paper px-2 py-1 text-xs text-ink-muted"
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-0.5 rounded p-0.5 hover:text-danger"
                  aria-label={`Remove ${f.name}`}
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {fileError && (
          <p className="mb-2 text-xs text-danger" role="alert">
            {fileError}
          </p>
        )}

        <div
          className={clsx(
            "flex items-end gap-2 rounded-2xl border bg-surface px-2 py-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
            dragging ? "border-dashed border-accent bg-accent-light/40" : "border-line"
          )}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="icon-btn h-9 w-9 shrink-0 rounded-full"
            aria-label="Attach files"
            title={`Attach files (PDF, images, code or text — up to ${MAX_FILES}, ${MAX_FILE_MB} MB each)`}
          >
            <PaperclipIcon className="h-[18px] w-[18px]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={dragging ? "Drop files to attach" : "Message..."}
            rows={1}
            aria-label="Message"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition hover:opacity-85"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
              aria-label="Send message"
              title="Send"
            >
              <SendIcon />
            </button>
          )}
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-ink-muted sm:block">
          Enter to send · Shift + Enter for a new line · drop or paste files to attach
        </p>
      </form>
    </div>
  );
}
