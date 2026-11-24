import { Header } from "@/components/header";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

/** Per-request shell for every route that needs the owner session or the
 * `lang` cookie. The root layout is static and always says lang="en", so a
 * Chinese render corrects <html lang> here (LanguageToggle does the same on
 * the client when the visitor switches). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <>
      {lang === "zh" && (
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.lang="zh-CN"' }} />
      )}
      <Header />
      {/* max-w-[82rem] = the classroom article page's sidebar (16rem) +
          gap-8 (2rem) + its content column (max-w-5xl = 64rem), so that
          page's header lines up exactly with content + nav combined. */}
      <main className="mx-auto flex w-full max-w-[82rem] flex-1 flex-col px-6 py-10">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-fg-secondary">
        {t(lang).footer.tagline}
      </footer>
    </>
  );
}
