import type { Metadata } from "next";
import { Hanken_Grotesk, Source_Serif_4 } from "next/font/google";
import "./globals.css";
// Math (KaTeX) and code syntax-highlighting styles for the Markdown
// renderer (src/components/markdown.tsx) — imported once here so every
// route that renders article/note bodies gets them.
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { ThemeScript } from "@/components/theme-script";
import { Header } from "@/components/header";
import { BackToTopButton } from "@/components/back-to-top-button";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";

// The Claude.ai type pairing, in free-font form: Anthropic's actual fonts
// (Styrene for UI/headings, Tiempos for long-form prose) are commercial,
// so we use their closest Google Fonts counterparts — Hanken Grotesk as
// the app/UI sans, Source Serif 4 as the article-body serif. Exposed as
// CSS variables that globals.css maps onto Tailwind's font-sans /
// font-serif; CJK text falls back to system fonts per the stacks there.
const fontSans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-app",
  display: "swap",
});
const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif-app",
  display: "swap",
});

export const metadata: Metadata = {
  // Required for the relative `alternates.canonical` values set by the
  // article and subcategory pages to render as absolute URLs.
  metadataBase: new URL(siteUrl()),
  title: "BrainBank",
  description:
    "A daily knowledge base: capture text, links, videos and documents; connect them; understand what, how, and why.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();

  return (
    <html
      lang={lang === "zh" ? "zh-CN" : "en"}
      className={`h-full ${fontSans.variable} ${fontSerif.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg antialiased">
        {/* No next-auth SessionProvider: nothing calls useSession() (pages read
            the session server-side via auth(), and login uses signIn(), which
            needs no provider). The provider still fetched /api/auth/session on
            every page load and every tab refocus, ~0.5s of function time each. */}
          <Header />
          {/* max-w-[82rem] = the classroom article page's sidebar (16rem) +
              gap-8 (2rem) + its content column (max-w-5xl = 64rem), so that
              page's header lines up exactly with content + nav combined
              instead of the nav poking out past a narrower header. Every
              other page just gets a bit more breathing room at this width;
              none of them assume the old max-w-5xl as a hard constraint. */}
          <main className="mx-auto flex w-full max-w-[82rem] flex-1 flex-col px-6 py-10">
            {children}
          </main>
          <footer className="border-t border-border py-6 text-center text-sm text-fg-secondary">
            {t(lang).footer.tagline}
          </footer>
          <BackToTopButton />
      </body>
    </html>
  );
}
