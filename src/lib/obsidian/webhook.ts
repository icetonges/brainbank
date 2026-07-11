import { createHmac, timingSafeEqual } from "node:crypto";

interface PushCommit {
  added?: unknown;
  modified?: unknown;
  removed?: unknown;
}

interface PushPayload {
  ref?: unknown;
  repository?: { full_name?: unknown };
  commits?: unknown;
}

export function createWebhookSignature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = createWebhookSignature(body, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function changedPaths(commits: unknown): string[] {
  if (!Array.isArray(commits)) return [];
  const paths: string[] = [];
  for (const rawCommit of commits) {
    if (!rawCommit || typeof rawCommit !== "object") continue;
    const commit = rawCommit as PushCommit;
    for (const value of [commit.added, commit.modified, commit.removed]) {
      if (Array.isArray(value)) paths.push(...value.filter((path): path is string => typeof path === "string"));
    }
  }
  return paths;
}

export function shouldSyncPush(
  payload: PushPayload,
  configuredRepo: string,
  configuredBranch: string,
  configuredVaultPath: string,
): boolean {
  if (payload.repository?.full_name !== configuredRepo) return false;
  if (payload.ref !== `refs/heads/${configuredBranch}`) return false;
  const vaultPath = configuredVaultPath.replace(/^\/+|\/+$/g, "");
  const prefix = `${vaultPath}/`;
  return changedPaths(payload.commits).some(
    (path) => path.startsWith(prefix) && path.toLowerCase().endsWith(".md"),
  );
}

export function isObsidianWebhookConfigured(): boolean {
  return Boolean(process.env.GITHUB_WEBHOOK_SECRET);
}
