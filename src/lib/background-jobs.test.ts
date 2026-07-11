import assert from "node:assert/strict";
import test from "node:test";
import { dispatchIngestionJob, dispatchObsidianSync } from "./background-jobs";

test("dispatches ingestion work after the response", async () => {
  let task: (() => Promise<void>) | undefined;
  const calls: number[] = [];
  dispatchIngestionJob(
    { noteId: 42, sourceType: "youtube", sourceUrl: "https://youtu.be/dQw4w9WgXcQ" },
    (scheduled) => { task = scheduled; },
    async (data) => { calls.push(data.noteId); },
  );
  assert.deepEqual(calls, []);
  await task?.();
  assert.deepEqual(calls, [42]);
});

test("dispatches Obsidian sync after the response", async () => {
  let task: (() => Promise<void>) | undefined;
  const calls: number[] = [];
  dispatchObsidianSync(
    7,
    (scheduled) => { task = scheduled; },
    async (runId) => { calls.push(runId); },
  );
  await task?.();
  assert.deepEqual(calls, [7]);
});
