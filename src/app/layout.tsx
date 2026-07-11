import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { Header } from "@/components/header";
import { AppSessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "brainbank",
  description:
    "A daily knowledge base: capture text, links, videos and documents; connect them; understand what, how, and why.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
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
            brainbank — your daily knowledge base
          </footer>
        </AppSessionProvider>
      </body>
    </html>
  );
}
