import { dispatchObsidianSync } from "@/lib/background-jobs";
import { createSyncRun } from "@/lib/obsidian/persist";
import {
  isObsidianWebhookConfigured,
  shouldSyncPush,
  verifyWebhookSignature,
} from "@/lib/obsidian/webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024;

export async function GET() {
  return Response.json({
    ok: true,
    configured: isObsidianWebhookConfigured(),
    endpoint: "/api/obsidian-webhook",
  });
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook is not configured", { status: 503 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  if (!verifyWebhookSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true, event: "ping" });
  if (event !== "push") return Response.json({ ok: true, ignored: true, reason: "event" });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const repo = process.env.GITHUB_OBSIDIAN_REPO ?? "";
  const branch = process.env.GITHUB_OBSIDIAN_BRANCH || "main";
  const vaultPath = process.env.GITHUB_OBSIDIAN_PATH || "notes";
  if (!payload || typeof payload !== "object" || !shouldSyncPush(payload, repo, branch, vaultPath)) {
    return Response.json({ ok: true, ignored: true, reason: "path-or-ref" });
  }

  const runId = await createSyncRun();
  dispatchObsidianSync(runId);
  return Response.json({ ok: true, queued: true, runId }, { status: 202 });
}
