import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function Header() {
  const session = await auth();
  // The LanguageToggle sets the `lang` cookie before navigating, so the
  // header (which has no searchParams) can rely on the cookie alone.
  const lang = await getLang();
  const s = t(lang).header;

  return (
    <header className="border-b border-border bg-bg-elevated">
      {/* Matches <main>'s max-w-[82rem] in layout.tsx — see the comment
          there for why it's wider than the old max-w-5xl. */}
      <div className="mx-auto flex max-w-[82rem] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight text-fg">
          Brain<span className="text-accent">Bank</span>
        </Link>

        <form
          action="/search"
          method="get"
          className="hidden flex-1 max-w-xs sm:block"
        >
          <input
            type="text"
            name="q"
            placeholder={s.searchPlaceholder}
            className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </form>

        <nav className="flex items-center gap-3">
          <Link
            href="/search"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors sm:hidden"
          >
            {s.search}
          </Link>
          <Link
            href="/classroom"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors"
          >
            {s.classroom}
          </Link>

          {session ? (
            <>
              <Link
                href="/classroom/new"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
              >
                {s.newArticle}
              </Link>
              <Link
                href="/graph"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors"
              >
                {s.graph}
              </Link>
              <Link
                href="/obsidian"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors"
              >
                {s.obsidian}
              </Link>
              <Link
                href="/new"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
              >
                {s.newKnowledge}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent hover:border-accent transition-colors"
                >
                  {s.signOut}
                </button>
              </form>
            </>
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
      </div>
    </header>
  );
}
