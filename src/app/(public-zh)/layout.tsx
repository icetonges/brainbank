import { HeaderView } from "@/components/header";
import { t } from "@/lib/i18n";

/** Static shell for the cached Chinese public pages under /pubzh. Anonymous
 * visitors with `lang=zh` (query or cookie) are rewritten here (see
 * next.config.ts), the same way English readers get /pub. Before this, every
 * Chinese page view, mostly crawlers following the ?lang=zh links, ran a
 * function and woke the Neon database. */
export default function PublicZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.lang="zh-CN"' }} />
      <HeaderView session={false} lang="zh" />
      <main className="mx-auto flex w-full max-w-[82rem] flex-1 flex-col px-6 py-10">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-fg-secondary">
        {t("zh").footer.tagline}
      </footer>
    </>
  );
}
