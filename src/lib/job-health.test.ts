import assert from "node:assert/strict";
import test from "node:test";
import { staleJobMessage } from "./job-health";

const now = new Date("2026-07-11T16:00:00Z");

test("fails queued jobs that never start", () => {
  assert.match(staleJobMessage("queued", new Date("2026-07-11T15:57:00Z"), now) ?? "", /never started/i);
  assert.equal(staleJobMessage("queued", new Date("2026-07-11T15:59:30Z"), now), null);
});

test("fails running jobs that stop making progress", () => {
  assert.match(staleJobMessage("running", new Date("2026-07-11T15:40:00Z"), now) ?? "", /timed out/i);
  assert.equal(staleJobMessage("succeeded", new Date("2026-07-11T15:00:00Z"), now), null);
});
