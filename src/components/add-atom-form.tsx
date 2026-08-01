"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { addAtomAction } from "@/app/assistant/actions";
import { ATOM_KIND_COLORS } from "@/lib/knowledge/taxonomy";
import type { Lang } from "@/lib/i18n";

const KINDS = [
  "fact",
  "preference",
  "pattern",
  "goal",
  "person",
  "project",
  "skill",
  "question",
  "idea",
] as const;

/**
 * Manual knowledge growth — tell the assistant something directly instead
 * of waiting for it to infer it from a diary entry.
 *
 * Hand-added atoms are created pinned and high-confidence (see
 * addAtomAction): the owner asserting something is stronger evidence than
 * anything the extractor infers, and it should never decay away.
 */
export function AddAtomForm({ lang = "en" }: { lang?: Lang }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await addAtomAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-bg-elevated p-4"
    >
      <input
        type="text"
        name="statement"
        required
        minLength={3}
        maxLength={500}
        placeholder={
          lang === "zh"
            ? "例如：更喜欢在早上做深度工作"
            : "e.g. Prefers deep work before 10am"
        }
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent"
      />
      <textarea
        name="detail"
        rows={2}
        placeholder={lang === "zh" ? "补充说明（可选）" : "Any nuance or caveat (optional)"}
        className="resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="kind"
          defaultValue="preference"
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1">
          {KINDS.map((k) => (
            <span
              key={k}
              title={k}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: ATOM_KIND_COLORS[k] }}
            />
          ))}
        </span>
        <SubmitButton lang={lang} />
      </div>
      <p className="text-xs text-fg-secondary">
        {lang === "zh"
          ? "手动添加的知识会自动固定，不会随时间衰减。"
          : "Hand-added knowledge is pinned automatically and never decays."}
      </p>
    </form>
  );
}

function SubmitButton({ lang }: { lang: Lang }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? (lang === "zh" ? "添加中…" : "Adding…") : lang === "zh" ? "教给它" : "Teach it"}
    </button>
  );
}
