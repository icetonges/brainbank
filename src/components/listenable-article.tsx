"use client";

import { useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import type { MarkdownBlock } from "@/lib/markdown-blocks";

export interface ListenableArticleStrings {
  playArticleAudio: string;
  pauseAudio: string;
  paragraphOf: string; // e.g. "Paragraph {n} of {total}" with literal {n}/{total}
  audioPrev: string;
  audioNext: string;
  clickHint: string;
}

/**
 * Renders an article as a sequence of independently-playable blocks.
 * Nothing ever plays on its own — every clip starts from an explicit
 * click, never a hover or a page load:
 *
 *  - Clicking a paragraph/heading/list that has generated audio plays
 *    JUST that block (and stops when it ends — it does not continue into
 *    the next paragraph, since a single click on one paragraph shouldn't
 *    silently turn into listening to the whole rest of the article).
 *  - The "Play article aloud" transport button is the one control that
 *    plays continuously, advancing through the following blocks the way
 *    an audiobook does — but even that only starts because you clicked
 *    it. Prev/Next also stay in this continuous mode.
 *
 * "Paragraph N of M" counts speakable paragraphs, not raw audio files (a
 * single long paragraph can be split across more than one file — see
 * classroom/audio-actions.ts's splitLongText — but that's an
 * implementation detail the reader shouldn't have to count through).
 *
 * Each block renders through its own <Markdown> call rather than one call
 * for the whole article, which is what makes per-block click targeting
 * possible — the tradeoff is that Markdown's `first:mt-0` heading-spacing
 * rule now fires on every block (each is the sole child of its own
 * wrapper), so this component restores a heading's usual extra top margin
 * itself via block.type instead.
 */
export function ListenableArticle({
  blocks,
  segmentsByBlock,
  s,
}: {
  blocks: MarkdownBlock[];
  /** blockIndex -> ordered audio urls for that block (almost always
   *  length 1; more than one only for an oversized paragraph/list split
   *  across several TTS calls). Blocks with no entry have no audio. */
  segmentsByBlock: Record<number, string[]>;
  s: ListenableArticleStrings;
}) {
  const spine = useMemo(
    () => blocks.filter((b) => (segmentsByBlock[b.index]?.length ?? 0) > 0).map((b) => b.index),
    [blocks, segmentsByBlock],
  );
  const [spinePos, setSpinePos] = useState(0); // position within `spine`
  const [pieceIndex, setPieceIndex] = useState(0); // which url within that block's own array
  const [isPlaying, setIsPlaying] = useState(false);
  // Whether reaching the end of the current block should advance into the
  // next one (the transport bar's Play/Prev/Next) or just stop (a click on
  // one specific paragraph) — see the component comment above.
  const [continuous, setContinuous] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasAudio = spine.length > 0;
  const currentBlockIndex = hasAudio ? spine[spinePos] : null;
  const currentUrls = currentBlockIndex !== null ? segmentsByBlock[currentBlockIndex] : undefined;
  const currentUrl = currentUrls?.[pieceIndex];

  function playFromSpine(pos: number, opts: { continuous: boolean }) {
    setSpinePos(pos);
    setPieceIndex(0);
    setContinuous(opts.continuous);
    setIsPlaying(true);
  }

  /** A click on one paragraph plays only that paragraph — deliberately
   *  NOT the same "keep going" behavior as the transport bar's Play
   *  button, so clicking a single paragraph to hear it can't turn into
   *  the whole rest of the article playing without you asking for that. */
  function handleBlockClick(blockIndex: number) {
    const pos = spine.indexOf(blockIndex);
    if (pos === -1) return; // no audio for this block
    playFromSpine(pos, { continuous: false });
  }

  function handleEnded() {
    const urls = currentUrls ?? [];
    if (pieceIndex + 1 < urls.length) {
      setPieceIndex((i) => i + 1);
      return;
    }
    if (continuous && spinePos + 1 < spine.length) {
      playFromSpine(spinePos + 1, { continuous: true });
      return;
    }
    setIsPlaying(false);
  }

  function togglePlay() {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    if (currentUrl) {
      // Resuming (or restarting) via the dedicated Play button always
      // means "keep going from here," even if the paused clip was
      // originally started as a single-paragraph click.
      setContinuous(true);
      setIsPlaying(true);
      audioRef.current?.play().catch(() => {});
    } else if (hasAudio) {
      playFromSpine(0, { continuous: true });
    }
  }

  const label = hasAudio
    ? s.paragraphOf.replace("{n}", String(spinePos + 1)).replace("{total}", String(spine.length))
    : "";

  return (
    <div className="flex flex-col gap-3">
      {hasAudio && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-elevated p-2 text-sm">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-md border border-accent/60 px-3 py-1.5 font-medium text-accent transition-colors hover:bg-accent hover:text-accent-fg"
          >
            {isPlaying ? `⏸ ${s.pauseAudio}` : `🔊 ${s.playArticleAudio}`}
          </button>
          <button
            type="button"
            disabled={spinePos === 0}
            onClick={() => playFromSpine(Math.max(0, spinePos - 1), { continuous: true })}
            className="rounded px-2 py-1 text-fg-secondary hover:bg-bg hover:text-accent disabled:opacity-30"
          >
            ‹ {s.audioPrev}
          </button>
          <span className="text-fg-secondary">{label}</span>
          <button
            type="button"
            disabled={spinePos === spine.length - 1}
            onClick={() => playFromSpine(Math.min(spine.length - 1, spinePos + 1), { continuous: true })}
            className="rounded px-2 py-1 text-fg-secondary hover:bg-bg hover:text-accent disabled:opacity-30"
          >
            {s.audioNext} ›
          </button>
          <span className="ml-auto hidden text-xs text-fg-secondary sm:inline">{s.clickHint}</span>
        </div>
      )}

      {/* One shared, hidden <audio> element reused across every block —
          same pattern as the /llm page's per-message play button — rather
          than an <audio> per block, so switching blocks is just a src
          swap instead of juggling N media elements. autoPlay only fires
          here because `isPlaying` can only become true from a click
          handler above (never a hover, never on mount) — see the
          component comment. */}
      {currentUrl && (
        <audio
          ref={audioRef}
          key={currentUrl}
          src={currentUrl}
          autoPlay={isPlaying}
          onEnded={handleEnded}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          className="hidden"
        />
      )}

      <div className="flex flex-col gap-3">
        {blocks.map((block) => {
          const active = currentBlockIndex === block.index && isPlaying;
          const listenable = (segmentsByBlock[block.index]?.length ?? 0) > 0;
          const headingSpacing = block.type === "heading" ? "mt-3 first:mt-0" : "";
          if (!listenable) {
            return (
              <div key={block.index} className={headingSpacing || undefined}>
                <Markdown>{block.markdown}</Markdown>
              </div>
            );
          }
          return (
            <div
              key={block.index}
              role="button"
              tabIndex={0}
              onClick={() => handleBlockClick(block.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleBlockClick(block.index);
                }
              }}
              aria-pressed={active}
              className={`-mx-2 cursor-pointer rounded-md border-l-2 px-2 py-0.5 transition-colors ${
                active
                  ? "border-accent bg-accent/5"
                  : "border-accent/20 hover:border-accent/50 hover:bg-bg-elevated/60"
              } ${headingSpacing}`}
            >
              <Markdown>{block.markdown}</Markdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}
