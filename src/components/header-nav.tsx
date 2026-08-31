"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";

interface HeaderNavStrings {
  search: string;
  searchPlaceholder: string;
  graph: string;
  classroom: string;
  obsidian: string;
  llm: string;
  trends: string;
  diary: string;
  assistant: string;
  newArticle: string;
  signOut: string;
  signIn: string;
  menu: string;
}

const linkClass =
  "rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors";
const accentLinkClass =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity";

/** The links shared by both the desktop row and the mobile dropdown, in one
 * place so the two can never drift out of sync. `mobile` only changes
 * spacing (the dropdown stacks everything full-width). */
function NavLinks({ session, s, mobile }: { session: boolean; s: HeaderNavStrings; mobile?: boolean }) {
  return (
    <>
      <Link href="/classroom" className={linkClass}>
        {s.classroom}
      </Link>
      {session && (
        <Link href="/classroom/new" className={`${accentLinkClass} ${mobile ? "text-center" : ""}`}>
          {s.newArticle}
        </Link>
      )}
      <Link href="/llm" className={linkClass}>
        {s.llm}
      </Link>
      <Link href="/trends" className={linkClass}>
        {s.trends}
      </Link>
      {session && (
        <>
          <Link href="/diary" className={`${accentLinkClass} ${mobile ? "text-center" : ""}`}>
            {s.diary}
          </Link>
          <Link href="/assistant" className={linkClass}>
            {s.assistant}
          </Link>
          <Link href="/graph" className={linkClass}>
            {s.graph}
          </Link>
          <Link href="/obsidian" className={linkClass}>
            {s.obsidian}
          </Link>
        </>
      )}
    </>
  );
}

/** Header's nav — a plain inline row from md and up, same as before; below
 * that it collapses into a single hamburger button that opens a dropdown
 * panel instead. The old layout let every link sit in one non-wrapping flex
 * row, which on narrow screens either overflowed the header or squeezed
 * labels until they clipped — a dropdown sidesteps both. `session` picks
 * which links show; `signOutForm` is server-rendered JSX (it embeds a
 * Server Action) handed down from the server-component Header, so this
 * client component never needs to know about auth itself. */
export function HeaderNav({
  session,
  s,
  signOutForm,
}: {
  session: boolean;
  s: HeaderNavStrings;
  signOutForm: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Closes the mobile panel automatically on navigation, so it doesn't
  // stay open over the newly-loaded page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* ---- Desktop / tablet: unchanged inline row, md and up ---- */}
      <nav className="hidden items-center gap-3 md:flex">
        <NavLinks session={session} s={s} />
        {session ? (
          signOutForm
        ) : (
          <Link
            href="/login"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
          >
            {s.signIn}
          </Link>
        )}
        <LanguageToggle />
        <ThemeToggle />
      </nav>

      {/* ---- Mobile: hamburger + dropdown panel, below md ---- */}
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={s.menu}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-fg-secondary hover:border-accent hover:text-accent transition-colors"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-lg border border-border bg-bg-elevated p-3 shadow-lg">
            <form action="/search" method="get" className="mb-1">
              <input
                type="text"
                name="q"
                placeholder={s.searchPlaceholder}
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
              />
            </form>

            <NavLinks session={session} s={s} mobile />

            <div className="my-1 border-t border-border" />

            {session ? (
              <div className="[&>form]:w-full [&_button]:w-full">{signOutForm}</div>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-border px-3 py-1.5 text-center text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
              >
                {s.signIn}
              </Link>
            )}
            <div className="mt-1 flex items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
