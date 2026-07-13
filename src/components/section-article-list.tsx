"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { reorderSectionArticles } from "@/app/classroom/actions";
import { formatDate } from "@/lib/date";

interface Article {
  id: number;
  slug: string;
  title: string;
  createdAt: string;
}

/**
 * A section's article list on its subcategory landing page
 * (/[subcategorySlug]) — plain and static for anonymous visitors, but
 * drag-to-reorder for the signed-in owner (`canReorder`). Reordering is
 * optimistic: the local list updates immediately on drop, then
 * reorderSectionArticles persists each article's new `sectionOrder` in the
 * background. Native HTML5 drag events rather than a library, since this is
 * the only drag surface in the app.
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
    <ul className="flex flex-col divide-y divide-border bg-bg-elevated">
      {items.map((a, i) => (
        <li
          key={a.id}
          draggable={canReorder}
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => canReorder && e.preventDefault()}
          onDrop={() => canReorder && handleDrop(i)}
          onDragEnd={() => setDragIndex(null)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
            dragIndex === i ? "opacity-40" : ""
          } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          {canReorder && (
            <span aria-hidden className="shrink-0 select-none text-fg-secondary">
              ⠿
            </span>
          )}
          <Link
            href={`/classroom/${a.slug}?lang=${lang}`}
            draggable={false}
            className="line-clamp-1 flex-1 text-fg-secondary hover:text-accent transition-colors"
          >
            {a.title}
          </Link>
          <span className="shrink-0 text-xs text-fg-secondary">
            {formatDate(a.createdAt, dateLocale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
