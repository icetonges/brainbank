import type { NextConfig } from "next";

// Requests that must get the per-request pages: the owner (Auth.js session
// cookie, http and https names) and anyone reading in Chinese (`lang=zh` as
// query or cookie). Everyone else is an anonymous English reader and gets the
// cached copy under /pub. These rules run in Vercel's routing layer, so
// deciding costs no function time. See src/lib/public-pages.ts.
const ownerCookies = [
  { type: "cookie" as const, key: "authjs.session-token" },
  { type: "cookie" as const, key: "__Secure-authjs.session-token" },
];
const anonymousEnglish = [
  ...ownerCookies,
  { type: "cookie" as const, key: "lang", value: "zh" },
  { type: "query" as const, key: "lang", value: "zh" },
];

// Anonymous Chinese readers get the cached copy under /pubzh. Two rules per
// URL because Next has no OR: `?lang=zh` wins outright, and the `lang=zh`
// cookie applies only when the URL names no language (mirrors getLang()).
// An explicit `?lang=en` with a zh cookie matches neither table and falls
// through to the per-request page, which is rare and still correct.
type Condition = { type: "cookie" | "query"; key: string; value?: string };
function zhRewrites(source: string, destination: string, extraMissing: Condition[] = []) {
  return [
    {
      source,
      destination,
      has: [{ type: "query" as const, key: "lang", value: "zh" }],
      missing: [...ownerCookies, ...extraMissing],
    },
    {
      source,
      destination,
      has: [{ type: "cookie" as const, key: "lang", value: "zh" }],
      missing: [...ownerCookies, { type: "query" as const, key: "lang" }, ...extraMissing],
    },
  ];
}

// /classroom's cached copy is the default "all" view only; other tabs read
// ?tab= and stay per-request.
const noTabFilter = [{ type: "query" as const, key: "tab" }];

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
  async rewrites() {
    return {
      // "/" is a filesystem route, so it has to be rewritten before files.
      beforeFiles: [
        ...zhRewrites("/", "/pubzh"),
        { source: "/", destination: "/pub", missing: anonymousEnglish },
        // /classroom is also a filesystem route.
        ...zhRewrites("/classroom", "/pubzh/classroom", noTabFilter),
        { source: "/classroom", destination: "/pub/classroom", missing: [...anonymousEnglish, ...noTabFilter] },
      ],
      // afterFiles runs after static routes (/classroom/new, /llm, /trends,
      // /login, ...) have had their chance, so only the dynamic
      // [subcategorySlug] and classroom/[slug] URLs fall through to these.
      afterFiles: [
        ...zhRewrites("/classroom/:slug", "/pubzh/classroom/:slug"),
        { source: "/classroom/:slug", destination: "/pub/classroom/:slug", missing: anonymousEnglish },
        ...zhRewrites("/:subcategorySlug", "/pubzh/:subcategorySlug"),
        { source: "/:subcategorySlug", destination: "/pub/:subcategorySlug", missing: anonymousEnglish },
      ],
    };
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
