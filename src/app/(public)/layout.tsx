import { HeaderView } from "@/components/header";
import { t } from "@/lib/i18n";

/** Static shell for the cached public pages under /pub. Anonymous visitors
 * reading in English are rewritten here (see next.config.ts), so this renders
 * exactly what (app)/layout.tsx would for them, without reading cookies. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderView session={false} lang="en" />
      <main className="mx-auto flex w-full max-w-[82rem] flex-1 flex-col px-6 py-10">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-fg-secondary">
        {t("en").footer.tagline}
      </footer>
    </>
  );
}
