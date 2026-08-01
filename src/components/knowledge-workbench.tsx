"use client";

import { useState, useTransition, useMemo } from "react";
import {
  KnowledgeConstellation,
  type ConstellationAtom,
  type ConstellationLink,
} from "./knowledge-constellation";
import {
  archiveAtomAction,
  pinAtomAction,
  updateAtomAction,
  mergeAtomsAction,
} from "@/app/assistant/actions";
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

export interface WorkbenchAtom extends ConstellationAtom {
  detail: string;
  status: string;
  sourceCount: number;
  lastReinforcedAt: string;
}

/**
 * The interactive half of the assistant page: the constellation plus an
 * inspector for whatever's selected, and a searchable list for curation.
 *
 * Selection is shared state between the map and the inspector, which is
 * why this is one client component rather than several — clicking a star
 * in the map and clicking a row in the list have to drive the same panel.
 */
export function KnowledgeWorkbench({
  atoms,
  links,
  lang = "en",
}: {
  atoms: WorkbenchAtom[];
  links: ConstellationLink[];
  lang?: Lang;
}) {
  const [selected, setSelected] = useState<WorkbenchAtom | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return atoms;
    return atoms.filter(
      (a) =>
        a.statement.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q) ||
        a.kind.includes(q),
    );
  }, [atoms, query]);

  const related = useMemo(() => {
    if (!selected) return [];
    return links
      .filter((l) => l.from === selected.id || l.to === selected.id)
      .map((l) => ({
        link: l,
        other: byId.get(l.from === selected.id ? l.to : l.from),
      }))
      .filter((r) => r.other);
  }, [selected, links, byId]);

  function select(atom: ConstellationAtom | null) {
    setEditing(false);
    setMergeTarget(null);
    setSelected(atom ? byId.get(atom.id) ?? null : null);
  }

  return (
    <div className="flex flex-col gap-4">
      <KnowledgeConstellation
        atoms={atoms}
        links={links}
        selectedId={selected?.id ?? null}
        onSelect={select}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Atom list / curation surface */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-4">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === "zh" ? "搜索知识…" : "Search what it knows…"}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
            />
            <span className="shrink-0 text-xs text-fg-secondary">{filtered.length}</span>
          </div>

          <ul className="flex max-h-[440px] flex-col divide-y divide-border overflow-y-auto">
            {filtered.map((atom) => (
              <li key={atom.id}>
                <button
                  type="button"
                  onClick={() => select(atom)}
                  className={`flex w-full items-start gap-2.5 px-1 py-2.5 text-left transition-colors hover:bg-bg ${
                    selected?.id === atom.id ? "bg-bg" : ""
                  }`}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ATOM_KIND_COLORS[atom.kind] ?? "#64748b" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">{atom.statement}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-secondary">
                      <span>{atom.kind}</span>
                      <span>·</span>
                      <span>{atom.reinforcementCount}×</span>
                      {atom.pinned && <span>📌</span>}
                      {atom.status === "archived" && <span className="text-warn">archived</span>}
                      {/* Confidence as a tiny inline meter reads faster
                          than a percentage in a dense list. */}
                      <span className="inline-flex h-1 w-10 overflow-hidden rounded-full bg-border">
                        <span
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(atom.confidence * 100)}%` }}
                        />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-sm text-fg-secondary">
                {lang === "zh" ? "没有匹配的知识。" : "Nothing matches."}
              </li>
            )}
          </ul>
        </section>

        {/* Inspector */}
        <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-fg-secondary">
              {lang === "zh"
                ? "点击星图或列表中的任意一项查看详情。"
                : "Pick a star or a row to inspect it."}
            </p>
          ) : editing ? (
            <form
              action={(fd) => {
                startTransition(async () => {
                  await updateAtomAction(
                    selected.id,
                    String(fd.get("statement") ?? ""),
                    String(fd.get("detail") ?? ""),
                    String(fd.get("kind") ?? "fact") as (typeof KINDS)[number],
                  );
                  setEditing(false);
                });
              }}
              className="flex flex-col gap-2.5"
            >
              <textarea
                name="statement"
                defaultValue={selected.statement}
                rows={3}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <textarea
                name="detail"
                defaultValue={selected.detail}
                rows={3}
                placeholder="detail"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <select
                name="kind"
                defaultValue={selected.kind}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-60"
                >
                  {pending ? "…" : lang === "zh" ? "保存" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-fg-secondary hover:text-fg"
                >
                  {lang === "zh" ? "取消" : "Cancel"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ATOM_KIND_COLORS[selected.kind] ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{selected.statement}</p>
                  {selected.detail && (
                    <p className="mt-1 text-xs text-fg-secondary">{selected.detail}</p>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Meta label={lang === "zh" ? "类型" : "kind"} value={selected.kind} />
                <Meta
                  label={lang === "zh" ? "置信度" : "confidence"}
                  value={`${Math.round(selected.confidence * 100)}%`}
                />
                <Meta
                  label={lang === "zh" ? "出现次数" : "reinforced"}
                  value={`${selected.reinforcementCount}×`}
                />
                <Meta
                  label={lang === "zh" ? "活跃度" : "salience"}
                  value={`${Math.round(selected.salience * 100)}%`}
                />
              </dl>

              {related.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                    {lang === "zh" ? "关联" : "Connected"}
                  </span>
                  {related.map(({ link, other }) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => select(other!)}
                      className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-accent"
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${
                          link.linkType === "contradicts" && !link.resolved
                            ? "bg-danger/15 text-danger"
                            : "bg-bg text-fg-secondary"
                        }`}
                      >
                        {link.linkType}
                      </span>
                      <span className="min-w-0 flex-1 text-fg-secondary">{other!.statement}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:border-accent hover:text-accent"
                >
                  ✏️ {lang === "zh" ? "编辑" : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => pinAtomAction(selected.id, !selected.pinned))
                  }
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  📌 {selected.pinned ? (lang === "zh" ? "取消固定" : "Unpin") : lang === "zh" ? "固定" : "Pin"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() =>
                      archiveAtomAction(selected.id, selected.status !== "archived"),
                    )
                  }
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg-secondary hover:border-warn hover:text-warn disabled:opacity-60"
                >
                  {selected.status === "archived"
                    ? `♻️ ${lang === "zh" ? "恢复" : "Restore"}`
                    : `🗄 ${lang === "zh" ? "归档" : "Trim"}`}
                </button>
              </div>

              {/* Merge — the manual fix for two atoms that are really one
                  belief the reconcile step didn't catch. */}
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                  {lang === "zh" ? "合并到…" : "Merge into…"}
                </span>
                <select
                  value={mergeTarget ?? ""}
                  onChange={(e) => setMergeTarget(Number(e.target.value) || null)}
                  className="rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
                >
                  <option value="">—</option>
                  {atoms
                    .filter((a) => a.id !== selected.id && a.status === "active")
                    .slice(0, 100)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.statement.slice(0, 60)}
                      </option>
                    ))}
                </select>
                {mergeTarget && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await mergeAtomsAction(selected.id, mergeTarget);
                        setSelected(null);
                        setMergeTarget(null);
                      })
                    }
                    className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-60"
                  >
                    {pending ? "…" : lang === "zh" ? "确认合并" : "Confirm merge"}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-fg-secondary">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}
