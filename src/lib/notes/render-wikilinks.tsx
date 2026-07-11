import Link from "next/link";
import { Fragment } from "react";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/**
 * Renders text containing [[Wikilinks]] (optionally [[Title|Display]]) as
 * plain text interleaved with real links wherever the title resolves to a
 * known note. Unresolved links render as plain text with a dashed
 * underline — a visual cue that the note doesn't exist yet.
 */
export function renderWithWikilinks(
  text: string,
  titleToSlug: Map<string, string>,
) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(WIKILINK_RE)) {
    const [full, title, display] = match;
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(<Fragment key={key++}>{text.slice(lastIndex, index)}</Fragment>);
    }

    const slug = titleToSlug.get(title.trim().toLowerCase());
    const label = display?.trim() || title.trim();

    if (slug) {
      parts.push(
        <Link
          key={key++}
          href={`/notes/${slug}`}
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {label}
        </Link>,
      );
    } else {
      parts.push(
        <span
          key={key++}
          className="text-fg-secondary underline decoration-dashed decoration-fg-secondary/50 underline-offset-2"
          title="No note with this title yet"
        >
          {label}
        </span>,
      );
    }

    lastIndex = index + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts;
}
