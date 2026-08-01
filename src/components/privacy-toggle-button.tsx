"use client";

import { useState, useTransition } from "react";
import { setArticlePrivacyAction } from "@/app/classroom/actions";
import { t, type Lang } from "@/lib/i18n";

/**
 * The classroom article page's lock/unlock control — "double mode", not a
 * one-way switch: click it once to make a published article private (locked,
 * only the logged-in owner can reach it — see the `status !== "published" &&
 * !session` gate on the article/list/side-nav pages), click it again to make
 * it public again. Same useTransition-driven pattern as DeleteArticleButton,
 * but without a confirm step — going private is reversible and low-risk
 * (nothing is deleted), so a confirm dialog here would just be friction.
 */
export function PrivacyToggleButton({
  noteId,
  slug,
  isPrivate,
  lang = "en",
  className,
}: {
  noteId: number;
  slug: string;
  isPrivate: boolean;
  lang?: Lang;
  className?: string;
}) {
  const s = t(lang).classroom;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setArticlePrivacyAction(noteId, slug, !isPrivate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update visibility");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={
          className ??
          "rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors disabled:opacity-60"
        }
      >
        {pending ? s.togglingPrivacy : isPrivate ? s.makePublic : s.makePrivate}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
