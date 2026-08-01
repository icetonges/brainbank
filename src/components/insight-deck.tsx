"use client";

import { useState, useTransition, useMemo } from "react";
import { setInsightStatusAction } from "@/app/assistant/actions";
import { INSIGHT_KIND_META } from "@/lib/knowledge/taxonomy";
import type { Lang } from "@/lib/i18n";

export interface DeckInsight {
  id: number;
  kind: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  atomCount: number;
}

/**
 * What the assistant has to say, as a filterable deck of cards.
 *
 * Cards are the right shape here (rather than a list) because insights are
 * meant to be considered one at a time and triaged — star the good ones,
 * dismiss the noise. That triage is also the only feedback signal the
 * system gets about output quality, so it's deliberately a single click.
 */
export function InsightDeck({
  insights,
  lang = "en",
}: {
  insights: DeckInsight[];
  lang?: Lang;
}) {
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const kinds = useMemo(
    () => Array.from(new Set(insights.map((i) => i.kind))),
    [insights],
  );

  const visible = useMemo(
    () => (kindFilter ? insights.filter((i) => i.kind === kindFilter) : insights),
    [insights, kindFilter],
  );

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-fg-secondary">
        <p className="text-lg">
          {lang === "zh" ? "还没有洞察。" : "No insights yet."}
        </p>
        <p className="mt-1 text-sm">
          {lang === "zh"
            ? "写几篇日记，然后点击上方的「思考」。"
            : "Write a few entries, then hit Think above."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setKindFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            kindFilter === null
              ? "border-accent bg-accent text-accent-fg"
              : "border-border text-fg-secondary hover:border-accent hover:text-accent"
          }`}
        >
          {lang === "zh" ? "全部" : "All"}
        </button>
        {kinds.map((kind) => {
          const meta = INSIGHT_KIND_META[kind];
          const active = kindFilter === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setKindFilter(active ? null : kind)}
              style={
                active
                  ? { backgroundColor: meta?.color, borderColor: meta?.color }
                  : { borderColor: `${meta?.color ?? "#64748b"}66` }
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active ? "text-white" : "text-fg-secondary hover:text-fg"
              }`}
            >
              {meta?.emoji} {lang === "zh" ? meta?.labelZh : meta?.labelEn}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((insight) => {
          const meta = INSIGHT_KIND_META[insight.kind];
          const isOpen = expanded === insight.id;
          const starred = insight.status === "starred";
          const acted = insight.status === "acted-on";

          return (
            <article
              key={insight.id}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-bg-elevated transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                starred ? "border-accent shadow-sm" : "border-border"
              }`}
              style={{ borderTopWidth: 3, borderTopColor: meta?.color ?? "#64748b" }}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : insight.id)}
                className="flex flex-1 flex-col gap-2 p-4 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: meta?.color }}
                >
                  {meta?.emoji} {lang === "zh" ? meta?.labelZh : meta?.labelEn}
                  {acted && <span className="text-success">✓</span>}
                  <span className="ml-auto font-normal normal-case text-fg-secondary">
                    {insight.atomCount} {lang === "zh" ? "个依据" : "sources"}
                  </span>
                </span>

                <h3 className="font-semibold leading-snug text-fg">{insight.title}</h3>

                <p
                  className={`text-sm leading-relaxed text-fg-secondary ${
                    isOpen ? "" : "line-clamp-3"
                  }`}
                >
                  {insight.body}
                </p>

                {!isOpen && insight.body.length > 160 && (
                  <span className="text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    {lang === "zh" ? "展开" : "Read more"} →
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1 border-t border-border px-3 py-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() =>
                      setInsightStatusAction(insight.id, starred ? "new" : "starred"),
                    )
                  }
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                    starred ? "text-accent" : "text-fg-secondary hover:text-accent"
                  }`}
                >
                  {starred ? "★" : "☆"} {lang === "zh" ? "收藏" : "Star"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() =>
                      setInsightStatusAction(insight.id, acted ? "new" : "acted-on"),
                    )
                  }
                  className="rounded px-2 py-1 text-xs font-medium text-fg-secondary transition-colors hover:text-success disabled:opacity-60"
                >
                  ✓ {lang === "zh" ? "已行动" : "Did it"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => setInsightStatusAction(insight.id, "dismissed"))
                  }
                  className="ml-auto rounded px-2 py-1 text-xs font-medium text-fg-secondary transition-colors hover:text-danger disabled:opacity-60"
                >
                  {lang === "zh" ? "忽略" : "Dismiss"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
