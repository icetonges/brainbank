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
import { AppSessionProvider } from "@/components/session-provider";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

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
        <AppSessionProvider>
          <Header />
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
            {children}
          </main>
          <footer className="border-t border-border py-6 text-center text-sm text-fg-secondary">
            {t(lang).footer.tagline}
          </footer>
        </AppSessionProvider>
      </body>
    </html>
  );
}
