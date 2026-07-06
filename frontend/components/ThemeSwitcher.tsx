"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ai-avatars-theme";

const THEMES = [
  { id: "matinee", label: "Matinee", swatch: "#EEF0F4" },
  { id: "midnight", label: "Midnight", swatch: "#14171F" },
  { id: "sepia", label: "Sepia", swatch: "#F1E7D6" },
];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState("matinee");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function selectTheme(id: string) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
        Theme
      </span>
      <div className="flex gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTheme(t.id)}
            title={t.label}
            className={`h-5 w-5 rounded-full border-2 transition ${
              theme === t.id ? "scale-110 border-accent" : "border-line"
            }`}
            style={{ backgroundColor: t.swatch }}
          />
        ))}
      </div>
    </div>
  );
}