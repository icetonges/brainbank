import assert from "node:assert/strict";
import test from "node:test";
import { installCanvasGlobals, loadPdfParse } from "./pdf-runtime";

test("installs PDF.js canvas globals without replacing existing values", () => {
  class FakeDOMMatrix {}
  class ExistingImageData {}
  class FakeImageData {}
  class FakePath2D {}
  const target: Record<string, unknown> = { ImageData: ExistingImageData };

  installCanvasGlobals(target, {
    DOMMatrix: FakeDOMMatrix,
    ImageData: FakeImageData,
    Path2D: FakePath2D,
  });

  assert.equal(target.DOMMatrix, FakeDOMMatrix);
  assert.equal(target.ImageData, ExistingImageData);
  assert.equal(target.Path2D, FakePath2D);
});

test("loads canvas before pdf-parse", async () => {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  class FakeDOMMatrix {}
  class FakeImageData {}
  class FakePath2D {}
  class FakePDFParse {}

  const runtime = await loadPdfParse(
    target,
    async () => {
      calls.push("canvas");
      return { DOMMatrix: FakeDOMMatrix, ImageData: FakeImageData, Path2D: FakePath2D };
    },
    async () => {
      calls.push("pdf-parse");
      assert.equal(target.DOMMatrix, FakeDOMMatrix);
      return { PDFParse: FakePDFParse };
    },
  );

  assert.deepEqual(calls, ["canvas", "pdf-parse"]);
  assert.equal(runtime.PDFParse, FakePDFParse);
});
