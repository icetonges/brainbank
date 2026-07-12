"use client";

import { useEffect, useId, useState } from "react";

/**
 * Renders a Mermaid diagram (flowchart, sequence diagram, etc.) from its
 * raw source text. Routed to from a ```mermaid fenced code block in
 * article/note markdown — see the `pre` override in markdown.tsx, which
 * pulls the block's raw text straight off the hast AST (not the rendered
 * React children) so this always gets the untouched source regardless of
 * what rehype-highlight did to the surrounding tree.
 *
 * mermaid.js only runs in the browser (it touches the DOM directly to
 * measure text for layout), so this renders "Rendering diagram…" during
 * SSR/hydration and swaps in real SVG once mermaid.render() resolves.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("mermaid").then(async (mod) => {
      const mermaid = mod.default;
      const isLight = document.documentElement.classList.contains("light");
      mermaid.initialize({
        startOnLoad: false,
        theme: isLight ? "default" : "dark",
        securityLevel: "strict",
      });
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${rawId}`, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, rawId]);

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-bg p-3 text-sm text-fg-secondary">
        <p className="text-danger">Diagram failed to render: {error}</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-md border border-border bg-bg p-4 text-sm text-fg-secondary">
        Rendering diagram…
      </div>
    );
  }

  // eslint-disable-next-line react/no-danger -- mermaid.render()'s own SVG output, not user HTML.
  return (
    <div
      className="overflow-x-auto rounded-md border border-border bg-bg p-4 [&_svg]:mx-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
