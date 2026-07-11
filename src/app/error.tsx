"use client";

import { useEffect } from "react";
import Link from "next/link";

// App Router error boundary: catches any uncaught exception thrown while
// rendering a page (Server or Client Component) below the root layout and
// shows something actionable instead of the generic Next.js/Vercel "server
// error" wall with zero detail. The actual error is logged to the console,
// which Vercel captures in the function's runtime logs — that's where to
// look next time this fires.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
      <p className="text-lg font-medium text-fg">Something went wrong loading this page.</p>
      <p className="max-w-md text-sm text-fg-secondary">
        {error.message || "An unexpected error occurred."}
        {error.digest && (
          <>
            <br />
            <span className="text-xs">Reference: {error.digest}</span>
          </>
        )}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
