"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Reads DOM state set synchronously by ThemeScript before hydration;
    // this only ever runs once on mount to sync React state to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      // localStorage unavailable — theme just won't persist
    }
  }

  return (
    <button
      onClick={toggle}
      type="button"
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
      aria-label="Toggle light and dark mode"
    >
      {isLight ? "Dark mode" : "Light mode"}
    </button>
  );
}
