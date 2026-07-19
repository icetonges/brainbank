import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { MermaidDiagram } from "@/components/mermaid-diagram";

/** react-markdown passes a `node` prop (the AST node) to every component
 * override — it must not be spread onto a DOM element. */
function dom<T>(props: T & ExtraProps): T {
  const { node, ...rest } = props;
  void node;
  return rest as T;
}

/** Minimal hast node shape — just enough to walk a code block's AST for
 * its raw text and language class, without pulling in @types/hast. */
interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

/** Recursively pulls plain text out of a hast subtree — used to grab a
 * fenced code block's *original* source, bypassing whatever rehype-
 * highlight did to the tree (wrapping tokens in <span>s) so a ```mermaid
 * block always gets its untouched diagram source regardless of whether
 * the syntax highlighter tried to tokenize it. */
function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/**
 * Renders markdown (article bodies, learning maps, hands-on steps) with
 * the app's theme tokens. Tailwind v4 without the typography plugin, so
 * each element gets its styles here instead of a `prose` class.
 */
export function Markdown({ children }: { children: string }) {
  return (
    // Serif body (the Claude.ai long-form reading style — see the font
    // pairing note in layout.tsx) with sans-serif headings for contrast;
    // code and tables stay mono/sans via their own rules below.
    <div className="flex flex-col gap-3 font-serif text-[1.0625rem] text-fg leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          h1: (p) => (
            <h2
              className="mt-6 border-b border-border pb-2 font-sans text-xl font-semibold tracking-tight text-fg first:mt-0"
              {...dom(p)}
            />
          ),
          h2: (p) => (
            <h3
              className="mt-6 border-b border-border pb-2 font-sans text-lg font-semibold tracking-tight text-fg first:mt-0"
              {...dom(p)}
            />
          ),
          h3: (p) => (
            <h4 className="mt-4 font-sans text-base font-semibold text-fg first:mt-0" {...dom(p)} />
          ),
          p: (p) => <p {...dom(p)} />,
          strong: (p) => <strong className="font-semibold text-fg" {...dom(p)} />,
          em: (p) => <em className="italic" {...dom(p)} />,
          a: (p) => (
            <a
              className="text-accent underline underline-offset-2 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
              {...dom(p)}
            />
          ),
          ul: (p) => <ul className="ml-5 list-disc space-y-1" {...dom(p)} />,
          ol: (p) => <ol className="ml-5 list-decimal space-y-1" {...dom(p)} />,
          li: (p) => <li className="pl-1" {...dom(p)} />,
          blockquote: (p) => (
            <blockquote
              className="rounded-r-md border-l-2 border-accent/60 bg-bg-elevated/60 py-2 pl-4 pr-3 text-fg-secondary [&>p]:m-0"
              {...dom(p)}
            />
          ),
          // rehype-highlight tags fenced code blocks' <code> with a
          // "hljs language-xxx" className (and colored token spans inside)
          // — leave those alone so the syntax-highlight theme applies.
          // Inline `code` spans get no className from rehype-highlight, so
          // that's how we tell the two apart and give inline code its own
          // pill styling instead.
          code: (p) => {
            const { className, children, ...rest } = dom(p);
            if (className) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
                {...rest}
              >
                {children}
              </code>
            );
          },
          pre: (p) => {
            // Detect a ```mermaid fenced block straight off the AST (node
            // reflects the original source regardless of what rehype-
            // highlight did to the rendered children) and route it to the
            // diagram renderer instead of a plain code box.
            const node = (p as unknown as { node?: HastNode }).node;
            const codeNode = node?.children?.find((c) => c.tagName === "code");
            const isMermaid = codeNode?.properties?.className?.includes("language-mermaid");
            if (isMermaid) {
              return <MermaidDiagram code={hastText(codeNode).replace(/\n$/, "")} />;
            }
            return (
              <pre
                className="overflow-x-auto rounded-md border border-border bg-bg p-3 text-sm"
                {...dom(p)}
              />
            );
          },
          img: (p) => {
            const { src, alt } = dom(p);
            // A real alt (not a pasted filename) doubles as a caption —
            // the formatter writes descriptive alt text, so images read
            // like proper article figures.
            const caption =
              alt && !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(alt.trim()) ? alt : "";
            // <span>s, not <figure>/<figcaption> — react-markdown wraps a
            // lone image in a <p>, and only phrasing content is valid
            // inside one (a <figure> there makes the browser close the
            // <p> early → React hydration mismatch).
            return (
              <span className="my-2 flex flex-col items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={typeof src === "string" ? src : undefined}
                  alt={alt ?? ""}
                  loading="lazy"
                  className="max-h-[520px] rounded-lg border border-border shadow-sm"
                />
                {caption && (
                  <span className="text-center font-sans text-xs text-fg-secondary">{caption}</span>
                )}
              </span>
            );
          },
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-sans text-sm" {...dom(p)} />
            </div>
          ),
          th: (p) => (
            <th
              className="border border-border bg-bg px-3 py-1.5 text-left font-semibold"
              {...dom(p)}
            />
          ),
          td: (p) => <td className="border border-border px-3 py-1.5" {...dom(p)} />,
          hr: () => <hr className="border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
