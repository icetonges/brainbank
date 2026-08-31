"use client";

import { useEffect, useState } from "react";

// Fixed on the right edge, vertically centered in the viewport rather than
// pinned to the top corner — pages here can run long, so the button stays
// reachable no matter how far down you've scrolled instead of requiring a
// trip back to the top just to find it. Only shown once there's actually
// somewhere to scroll back *from* (a hidden threshold below), and it floats
// past the content column rather than sitting inside it, so it never covers
// article text.
const SHOW_AFTER_PX = 400;

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed right-3 top-1/2 z-40 -translate-y-1/2 rounded-full border border-border bg-bg-elevated/90 p-2.5 text-fg-secondary shadow-md backdrop-blur transition-colors hover:border-accent hover:text-accent sm:right-6"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
      </svg>
    </button>
  );
}
