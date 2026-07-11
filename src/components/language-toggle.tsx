"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Site-wide EN/ZH preference. The query parameter drives translated note
// content while the cookie/localStorage keep the selection across navigation.
export function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
      document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", next);
    router.push(`${pathname}?${params.toString()}`);
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
