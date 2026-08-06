import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString as mdastToString } from "mdast-util-to-string";

/**
 * Splits article markdown into the SAME top-level blocks react-markdown
 * renders as top-level DOM nodes (one <p>, <h2>, <ul>, <blockquote>,
 * <table>, <pre>, <hr> each) — shared by the audiobook generator
 * (classroom/audio-actions.ts, one TTS call per speakable block) and the
 * hover-to-play article renderer (components/listenable-article.tsx) so
 * "block 7" means the identical paragraph in both places. Previously the
 * audiobook was generated from ~1800-char merged chunks that ignored
 * paragraph boundaries entirely — this both fixes that (see speechText)
 * and is what makes per-paragraph hover playback possible in the first
 * place.
 */

/** Minimal duck-typed mdast node shape — just enough of the AST to walk
 *  it and slice the original source by position, without taking a hard
 *  dependency on @types/mdast's full node-type union (same spirit as
 *  markdown.tsx's local HastNode interface for the hast/rehype side). */
interface MdastNode {
  type: string;
  children?: MdastNode[];
  position?: { start: { offset: number }; end: { offset: number } };
}

export interface MarkdownBlock {
  /** 0-based position among ALL top-level blocks, in document order —
   *  shared by the generated audio segment array and the rendered
   *  article, so "hover the 7th block" and "segment for block 7" always
   *  refer to the same paragraph even though not every block has audio
   *  (see speechText). */
  index: number;
  /** mdast node type ("heading", "paragraph", "list", "blockquote",
   *  "table", "code", "thematicBreak", "html", ...) — the renderer uses
   *  this to restore a heading's usual extra top margin, which is lost
   *  when each block becomes its own isolated Markdown render (see that
   *  component's comment). */
  type: string;
  /** The block's own markdown source, sliced from the original string by
   *  the AST node's character offsets — not re-serialized through a
   *  markdown printer, so nested emphasis/links/formatting survive byte-
   *  for-byte instead of risking a reformat. */
  markdown: string;
  /** Plain, TTS-ready text for this block, or null if this block type
   *  shouldn't be read aloud (code, table, thematic break, raw html, or
   *  an image-only paragraph with no alt text) — reading a fenced code
   *  block or a markdown table cell-by-cell aloud helps no one (same
   *  reasoning as lib/ai/media.ts's markdownToSpeechText code-block
   *  stripping, just scoped per-block instead of to the whole document). */
  speechText: string | null;
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** mdast-util-to-string concatenates a `list` node's descendant text with
 *  no separator at all, which reads as one run-on clause — join list
 *  items with ". " so a bullet list is spoken as distinct sentences. Not
 *  language-aware (a "。"-only separator for Chinese would be marginally
 *  more natural) but the TTS engine handles a stray ". " between CJK
 *  clauses fine in practice, and this keeps one code path for both. */
function listSpeechText(node: MdastNode): string {
  const items = (node.children ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridging
    // our minimal MdastNode to mdast-util-to-string's full Nodes union
    .map((item) => mdastToString(item as any).trim())
    .filter(Boolean);
  return items.join(". ");
}

function blockSpeechText(node: MdastNode): string | null {
  switch (node.type) {
    case "heading":
    case "paragraph":
    case "blockquote": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = mdastToString(node as any).trim();
      return text || null;
    }
    case "list":
      return listSpeechText(node) || null;
    // code, table, thematicBreak, html, and definition/footnote nodes all
    // fall through to null: no audio, but the block index is still
    // reserved so hover targeting in the rendered article stays aligned
    // with the audio segment array.
    default:
      return null;
  }
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const tree = parser.parse(markdown) as unknown as MdastNode;
  const blocks: MarkdownBlock[] = [];
  (tree.children ?? []).forEach((node, index) => {
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? start;
    blocks.push({
      index,
      type: node.type,
      markdown: markdown.slice(start, end),
      speechText: blockSpeechText(node),
    });
  });
  return blocks;
}

/** The exact text an audiobook was (or would be) generated from — used
 *  both when generating (classroom/audio-actions.ts, hashed and stored as
 *  audioSourceHash) and when rendering (classroom/[slug]/page.tsx, hashed
 *  fresh and compared against the stored one) so both sides agree on what
 *  "the article's speech content" means and staleness detection doesn't
 *  false-positive from the two sides computing it differently. */
export function speechTextForStaleness(markdown: string): string {
  return splitMarkdownBlocks(markdown)
    .map((b) => b.speechText)
    .filter((t): t is string => Boolean(t))
    .join("\n\n");
}
