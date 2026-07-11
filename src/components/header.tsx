import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";

export async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-fg">
          brain<span className="text-accent">bank</span>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/graph"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary hover:text-accent transition-colors"
          >
            Graph
          </Link>

          {session ? (
            <>
              <Link
                href="/new"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
              >
                + New knowledge
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
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
            >
              Sign in
            </Link>
          )}

          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
