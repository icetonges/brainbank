"use client";

import { useEffect, useState } from "react";

// UI-level EN/ZH toggle. Wiring this to per-note translated content happens
// once the translation pipeline (PLAN.md §6) lands; for now it flips a
// site-wide preference that pages can read via the `lang` cookie/localStorage.
export function LanguageToggle() {
  const [lang, setLang] = useState<"en" | "zh">("en");

  useEffect(() => {
    const stored = localStorage.getItem("lang");
    // Syncs React state to localStorage once on mount (client-only value,
    // not knowable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "zh" || stored === "en") setLang(stored);
  }, []);

  function toggle() {
    const next = lang === "en" ? "zh" : "en";
    setLang(next);
    try {
      localStorage.setItem("lang", next);
      document.cookie = `lang=${next}; path=/; max-age=31536000`;
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={toggle}
      type="button"
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
      aria-label="Toggle English and Chinese"
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  );
}
