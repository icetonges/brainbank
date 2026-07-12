"use client";

import { useState, useTransition } from "react";
import { deleteClassroomArticle } from "@/app/classroom/actions";

/** Same confirm-then-delete pattern as DeleteNoteButton, but redirects
 * back to /classroom instead of the homepage. */
export function DeleteArticleButton({ noteId, title }: { noteId: number; title: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-danger hover:text-danger transition-colors"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-danger/50 bg-danger/10 px-3 py-1.5 text-sm">
      <span className="text-fg">Delete &quot;{title}&quot;? This can&apos;t be undone.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteClassroomArticle(noteId))}
        className="rounded bg-danger px-2 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? "Deleting…" : "Confirm delete"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded px-2 py-1 text-fg-secondary hover:text-fg"
      >
        Cancel
      </button>
    </div>
  );
}
