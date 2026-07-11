export interface CanvasRuntime {
  DOMMatrix: unknown;
  ImageData: unknown;
  Path2D: unknown;
}

interface PdfParseRuntime {
  PDFParse: new (options: { data: Uint8Array }) => {
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  };
}

type RuntimeGlobals = Record<string, unknown>;

export function installCanvasGlobals(target: RuntimeGlobals, canvas: CanvasRuntime) {
  target.DOMMatrix ??= canvas.DOMMatrix;
  target.ImageData ??= canvas.ImageData;
  target.Path2D ??= canvas.Path2D;
}

/**
 * PDF.js tries to require its canvas polyfill dynamically. Vercel cannot
 * reliably detect that dependency while tracing the Inngest function, so we
 * import it explicitly, install the globals PDF.js expects, and only then load
 * pdf-parse. Keeping both imports lazy prevents PDF.js from crashing every
 * ingestion source during /api/inngest module initialization.
 */
export async function loadPdfParse(
  target: RuntimeGlobals = globalThis as RuntimeGlobals,
  loadCanvas: () => Promise<CanvasRuntime> = async () => import("@napi-rs/canvas"),
  loadParser: () => Promise<PdfParseRuntime> = async () =>
    import("pdf-parse") as unknown as Promise<PdfParseRuntime>,
) {
  const canvas = await loadCanvas();
  installCanvasGlobals(target, canvas);
  return loadParser();
}
