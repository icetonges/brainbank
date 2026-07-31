"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { reorderSectionArticles } from "@/app/classroom/actions";
import { formatDateTime } from "@/lib/date";

interface Article {
  id: number;
  slug: string;
  title: string;
  createdAt: string;
  status?: string;
}

/**
 * A section's article list on its subcategory landing page
 * (/[subcategorySlug]) — plain and static for anonymous visitors, but
 * drag-to-reorder for the signed-in owner (`canReorder`). Reordering is
 * optimistic: the local list updates immediately on drop, then
 * reorderSectionArticles persists each article's new `sectionOrder` in the
 * background. Native HTML5 drag events rather than a library, since this is
 * the only drag surface in the app.
 *
 * Row styling (status badge, hover-accent title, formatDateTime, chevron)
 * deliberately mirrors ArticleRow on the /classroom overview page (see
 * classroom/page.tsx) — this page is meant to read as "the same shelf,
 * drilled in," not a visually distinct list.
 */
export function SectionArticleList({
  sectionId,
  subcategorySlug,
  articles,
  lang,
  canReorder,
  dateLocale,
}: {
  sectionId: number;
  subcategorySlug: string;
  articles: Article[];
  lang: string;
  canReorder: boolean;
  dateLocale?: string;
}) {
  const [items, setItems] = useState(articles);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next);
    setDragIndex(null);
    startTransition(() => {
      reorderSectionArticles(
        sectionId,
        subcategorySlug,
        next.map((a) => a.id),
      );
    });
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((a, i) => (
        <li
          key={a.id}
          draggable={canReorder}
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => canReorder && e.preventDefault()}
          onDrop={() => canReorder && handleDrop(i)}
          onDragEnd={() => setDragIndex(null)}
          className={`group flex items-center gap-2 text-sm transition-colors ${
            dragIndex === i ? "opacity-40" : ""
          } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          {canReorder && (
            <span aria-hidden className="shrink-0 select-none pl-4 text-fg-secondary">
              ⠿
            </span>
          )}
          <Link
            href={`/classroom/${a.slug}?lang=${lang}`}
            draggable={false}
            className={`flex flex-1 items-center justify-between gap-3 py-2.5 ${canReorder ? "pr-4" : "px-4"}`}
          >
            <span className="line-clamp-1 text-fg transition-colors group-hover:text-accent">
              {a.title}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-fg-secondary">
              {a.status && a.status !== "published" && (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">
                  {a.status}
                </span>
              )}
              {formatDateTime(a.createdAt, dateLocale)}
              <Chevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}
