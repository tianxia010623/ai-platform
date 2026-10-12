"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { THEMES, THEME_STORAGE_KEY } from "@/lib/theme";

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState("matinee");

  useEffect(() => {
    // The inline script in app/layout.tsx already applied it before paint;
    // this only syncs the selected swatch.
    const current = document.documentElement.getAttribute("data-theme");
    if (current) setTheme(current);
  }, []);

  function selectTheme(id: string) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // storage unavailable (private mode) -- theme still applies this visit
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2" role="radiogroup" aria-label="Theme">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">Theme</span>
      <div className="flex gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            aria-label={t.label}
            onClick={() => selectTheme(t.id)}
            title={t.label}
            className={clsx(
              "h-5 w-5 rounded-full border-2 transition",
              theme === t.id ? "scale-110 border-accent" : "border-line"
            )}
            style={{ backgroundColor: t.swatch }}
          />
        ))}
      </div>
    </div>
  );
}
