import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
  // PDF ingestion (src/lib/ingest/extract-pdf.ts -> pdf-runtime.ts) can run
  // inside whichever server function actually invoked it — not just
  // /api/inngest. Inngest Cloud isn't wired up by default (no
  // INNGEST_EVENT_KEY/SIGNING_KEY), so dispatchIngestionJob's after()
  // fallback runs the pipeline directly inside the server action that
  // called it: /new, /notes/[slug] (retry), /obsidian (freeform-note
  // drafting), and /api/obsidian-webhook. Next's file tracing can't see
  // pdfjs-dist's dynamically-resolved worker/canvas files, so every one of
  // those needs the same explicit include as /api/inngest or PDF parsing
  // crashes with "Cannot find module .../pdf.worker.mjs" in production.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/pdfjs-dist/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
