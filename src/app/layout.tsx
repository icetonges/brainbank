import type { Metadata } from "next";
import { Hanken_Grotesk, Source_Serif_4 } from "next/font/google";
import "./globals.css";
// Math (KaTeX) and code syntax-highlighting styles for the Markdown
// renderer (src/components/markdown.tsx) — imported once here so every
// route that renders article/note bodies gets them.
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { ThemeScript } from "@/components/theme-script";
import { BackToTopButton } from "@/components/back-to-top-button";
import { siteUrl } from "@/lib/site-url";
import { Analytics } from "@vercel/analytics/next";

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

// The root layout reads no cookies and no session, so it can be static. The
// header, <main> and footer live one level down: (app)/layout.tsx is the
// per-request version (owner session, `lang` cookie) and (public)/layout.tsx
// is the anonymous English version that the cached public pages render
// under. Before this split, the cookie read here made every page on the site
// a function invocation, including the article pages crawlers fetch all day.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${fontSans.variable} ${fontSerif.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg antialiased">
        {children}
        <BackToTopButton />
        <Analytics />
      </body>
    </html>
  );
}
