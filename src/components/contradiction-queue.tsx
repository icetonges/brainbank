"use client";

import { useTransition } from "react";
import { resolveContradictionAction, archiveAtomAction } from "@/app/assistant/actions";
import type { Lang } from "@/lib/i18n";

export interface ContradictionItem {
  linkId: number;
  rationale: string;
  a: { id: number; statement: string } | null;
  b: { id: number; statement: string } | null;
}

/**
 * The belief-update queue. When new evidence conflicts with something the
 * assistant already believed, both sides are kept and shown here side by
 * side rather than one silently winning — the owner picks which survives.
 *
 * This is the mechanism that makes the knowledge base capable of being
 * WRONG and then corrected, which is what separates it from an append-only
 * pile of AI notes. Archiving one side is the normal resolution; "keep
 * both" is legitimate too (people genuinely hold context-dependent
 * preferences), which is why that's a first-class option.
 */
export function ContradictionQueue({
  items,
  lang = "en",
}: {
  items: ContradictionItem[];
  lang?: Lang;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        if (!item.a || !item.b) return null;
        return (
          <li
            key={item.linkId}
            className="overflow-hidden rounded-2xl border border-danger/40 bg-bg-elevated"
          >
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {[item.a, item.b].map((side, i) => (
                <div key={side!.id} className="flex flex-col gap-2 bg-bg-elevated p-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-secondary">
                    {i === 0
                      ? lang === "zh"
                        ? "新的观察"
                        : "Newer"
                      : lang === "zh"
                        ? "已有的认知"
                        : "Existing"}
                  </span>
                  <p className="flex-1 text-sm text-fg">{side!.statement}</p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await archiveAtomAction(side!.id, true);
                        await resolveContradictionAction(item.linkId);
                      })
                    }
                    className="self-start rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-secondary hover:border-danger hover:text-danger disabled:opacity-60 transition-colors"
                  >
                    🗄 {lang === "zh" ? "归档这条" : "Retire this one"}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
              {item.rationale && (
                <span className="text-xs italic text-fg-secondary">⚡ {item.rationale}</span>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => resolveContradictionAction(item.linkId))}
                className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-fg-secondary hover:text-accent disabled:opacity-60"
              >
                {lang === "zh" ? "两者都保留" : "Keep both"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
