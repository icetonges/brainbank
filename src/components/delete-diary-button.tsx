"use client";

import { useState, useTransition } from "react";
import { deleteDiaryEntry } from "@/app/diary/actions";
import { t, type Lang } from "@/lib/i18n";

/** Confirm-then-delete, same pattern as DeleteArticleButton. The confirm
 *  step matters more here than elsewhere: a diary entry is unrecoverable
 *  personal writing, not a regenerable article. */
export function DeleteDiaryButton({
  noteId,
  title,
  lang = "en",
}: {
  noteId: number;
  title: string;
  lang?: Lang;
}) {
  const s = t(lang).diary;
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-danger hover:text-danger transition-colors"
      >
        {s.delete}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-danger/50 bg-danger/10 px-3 py-1.5 text-sm">
      <span className="text-fg">
        {s.deleteConfirm} &quot;{title}&quot;?
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteDiaryEntry(noteId))}
        className="rounded bg-danger px-2 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? s.deleting : s.deleteYes}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded px-2 py-1 text-fg-secondary hover:text-fg"
      >
        {s.cancel}
      </button>
    </div>
  );
}
