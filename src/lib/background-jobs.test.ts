import assert from "node:assert/strict";
import test from "node:test";
import { dispatchObsidianSync } from "./background-jobs";

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
