import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { HeaderNav } from "./header-nav";

export async function Header() {
  const session = await auth();
  // The LanguageToggle sets the `lang` cookie before navigating, so the
  // header (which has no searchParams) can rely on the cookie alone.
  const lang = await getLang();
  const s = t(lang).header;

  const signOutForm = session ? (
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
  ) : null;

  return (
    <header className="border-b border-border bg-bg-elevated">
      {/* Matches <main>'s max-w-[82rem] in layout.tsx — see the comment
          there for why it's wider than the old max-w-5xl. */}
      <div className="mx-auto flex max-w-[82rem] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="shrink-0 text-2xl font-bold tracking-tight text-fg">
          Brain<span className="text-accent">Bank</span>
        </Link>

        <form
          action="/search"
          method="get"
          className="hidden flex-1 max-w-xs md:block"
        >
          <input
            type="text"
            name="q"
            placeholder={s.searchPlaceholder}
            className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </form>

        <HeaderNav session={Boolean(session)} s={s} signOutForm={signOutForm} />
      </div>
    </header>
  );
}
