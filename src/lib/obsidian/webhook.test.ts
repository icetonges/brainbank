import assert from "node:assert/strict";
import test from "node:test";
import { createWebhookSignature, shouldSyncPush, verifyWebhookSignature } from "./webhook";

test("accepts a valid GitHub sha256 signature and rejects tampering", () => {
  const body = JSON.stringify({ ref: "refs/heads/main" });
  const signature = createWebhookSignature(body, "test-secret");
  assert.equal(verifyWebhookSignature(body, signature, "test-secret"), true);
  assert.equal(verifyWebhookSignature(`${body} `, signature, "test-secret"), false);
  assert.equal(verifyWebhookSignature(body, "sha256=bad", "test-secret"), false);
});

test("syncs only configured repository, branch, and markdown vault changes", () => {
  const base = {
    repository: { full_name: "icetonges/brainbank" },
    ref: "refs/heads/main",
    commits: [{ added: ["notes/new.md"], modified: [], removed: [] }],
  };
  assert.equal(shouldSyncPush(base, "icetonges/brainbank", "main", "notes"), true);
  assert.equal(shouldSyncPush({ ...base, ref: "refs/heads/dev" }, "icetonges/brainbank", "main", "notes"), false);
  assert.equal(
    shouldSyncPush({ ...base, repository: { full_name: "someone/else" } }, "icetonges/brainbank", "main", "notes"),
    false,
  );
  assert.equal(
    shouldSyncPush({ ...base, commits: [{ added: ["README.md"], modified: [], removed: [] }] }, "icetonges/brainbank", "main", "notes"),
    false,
  );
});

test("recognizes modified and removed markdown files below nested vault folders", () => {
  const payload = {
    repository: { full_name: "icetonges/brainbank" },
    ref: "refs/heads/main",
    commits: [{ added: [], modified: ["notes/ai/prompts.md"], removed: ["notes/old.md"] }],
  };
  assert.equal(shouldSyncPush(payload, "icetonges/brainbank", "main", "notes"), true);
});
