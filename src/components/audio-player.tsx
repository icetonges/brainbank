"use client";

import { useState } from "react";

export interface AudioPlayerStrings {
  audioPartOf: string; // e.g. "Part {n} of {total}" with literal {n}/{total}
  audioPrev: string;
  audioNext: string;
}

/**
 * Plays a generated audiobook — an ordered array of segment URLs (see the
 * audioSegments comment in db/schema.ts for why it's several files instead
 * of one: chunked TTS calls, not naive mp3-byte concatenation). Advances
 * to the next segment automatically when one ends; Prev/Next let you skip
 * around without scrubbing through a whole segment first. Native
 * `<audio controls>` per segment for scrub/volume/speed rather than
 * building custom transport controls — the only custom behavior needed is
 * "which segment," not "how do I represent a seek bar."
 */
export function AudioPlayer({
  segments,
  s,
}: {
  segments: string[];
  s: AudioPlayerStrings;
}) {
  const [index, setIndex] = useState(0);

  if (segments.length === 0) return null;

  const label = s.audioPartOf
    .replace("{n}", String(index + 1))
    .replace("{total}", String(segments.length));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4">
      {/* Remounting on src change (via key) is what makes the browser
          actually load the new segment — simpler and more reliable across
          browsers than imperatively calling audioEl.load(). autoPlay only
          kicks in past the first segment, so pressing play once and then
          letting a multi-part article run through is seamless; browsers'
          autoplay-after-interaction allowance covers the ended -> next
          transition since it follows the listener's own initial gesture. */}
      <audio
        key={segments[index]}
        src={segments[index]}
        controls
        autoPlay={index > 0}
        onEnded={() => setIndex((i) => Math.min(i + 1, segments.length - 1))}
        className="w-full"
      />
      {segments.length > 1 && (
        <div className="flex items-center justify-between text-xs text-fg-secondary">
          <span>{label}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              aria-label={s.audioPrev}
              className="rounded px-2 py-1 hover:bg-bg hover:text-accent disabled:opacity-30"
            >
              ‹ {s.audioPrev}
            </button>
            <button
              type="button"
              disabled={index === segments.length - 1}
              onClick={() => setIndex((i) => Math.min(segments.length - 1, i + 1))}
              aria-label={s.audioNext}
              className="rounded px-2 py-1 hover:bg-bg hover:text-accent disabled:opacity-30"
            >
              {s.audioNext} ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
