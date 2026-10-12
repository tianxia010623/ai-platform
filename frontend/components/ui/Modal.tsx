"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const EXIT_MS = 180;

/** Centered dialog card matching the login card style. Fades/scales in on
 * open and plays a short exit animation before unmounting on close. */
export default function Modal({
  open,
  onClose,
  eyebrow,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
    } else if (mounted) {
      setLeaving(true);
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-[2px]",
        leaving ? "animate-backdrop-out" : "animate-backdrop-in"
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "w-full max-w-sm rounded-2xl border border-line bg-surface px-8 py-8 text-center shadow-[0_1px_2px_rgba(20,23,31,0.04),0_16px_40px_rgba(20,23,31,0.14)]",
          leaving ? "animate-dialog-out" : "animate-dialog-in"
        )}
      >
        {eyebrow && (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent2">
            {eyebrow}
          </p>
        )}
        <h2 className="mb-2 font-display text-2xl font-semibold text-ink">{title}</h2>
        {children && <div className="mb-6 text-sm text-ink-muted">{children}</div>}
        <div className="flex justify-center gap-3">{actions}</div>
      </div>
    </div>
  );
}
