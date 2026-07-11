"use client";

import { useEffect } from "react";

// Next.js requires a separate global-error.tsx to catch exceptions thrown
// by the root layout itself (error.tsx only catches errors from routes
// nested inside a working layout) — it must render its own <html>/<body>
// since the real root layout is presumed broken. Same reasoning as
// error.tsx: never show a bare, undiagnosable crash screen.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0b0b0d",
          color: "#f5f4ef",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <p style={{ fontSize: "1.125rem", fontWeight: 500 }}>brainbank failed to load.</p>
        <p style={{ maxWidth: 480, fontSize: "0.875rem", color: "#d6d3c4" }}>
          {error.message || "An unexpected error occurred."}
          {error.digest && (
            <>
              <br />
              <span style={{ fontSize: "0.75rem" }}>Reference: {error.digest}</span>
            </>
          )}
        </p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: 6,
            background: "#d4af37",
            color: "#0b0b0d",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
