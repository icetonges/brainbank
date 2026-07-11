import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafePublicUrl,
  detectPrimaryLanguage,
  validateUploadMetadata,
} from "./intake";

test("detects Chinese text and keeps English as the default otherwise", () => {
  assert.equal(detectPrimaryLanguage("这是一个关于人工智能的学习笔记"), "zh");
  assert.equal(detectPrimaryLanguage("How retrieval augmented generation works"), "en");
});

test("accepts public HTTP URLs but rejects local and private-network targets", () => {
  assert.equal(assertSafePublicUrl("https://example.com/article").hostname, "example.com");
  for (const value of [
    "file:///etc/passwd",
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://10.0.0.4/",
    "http://192.168.1.5/",
    "http://169.254.169.254/latest/meta-data",
  ]) {
    assert.throws(() => assertSafePublicUrl(value));
  }
});

test("validates upload type, extension, size, and note id", () => {
  assert.doesNotThrow(() =>
    validateUploadMetadata({ noteId: 3, filename: "guide.pdf", mimeType: "application/pdf", sizeBytes: 52_000_000 }),
  );
  assert.throws(() =>
    validateUploadMetadata({ noteId: -1, filename: "guide.pdf", mimeType: "application/pdf", sizeBytes: 1 }),
  );
  assert.throws(() =>
    validateUploadMetadata({ noteId: 3, filename: "payload.exe", mimeType: "application/octet-stream", sizeBytes: 1 }),
  );
  assert.throws(() =>
    validateUploadMetadata({ noteId: 3, filename: "huge.pdf", mimeType: "application/pdf", sizeBytes: 101 * 1024 * 1024 }),
  );
});
