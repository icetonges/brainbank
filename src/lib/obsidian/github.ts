export interface VaultFile {
  /** Path within the repo, e.g. "notes/my-note.md". */
  path: string;
  /** Git blob sha — used to detect changed files without re-diffing content. */
  sha: string;
}

function repoConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_OBSIDIAN_REPO; // "owner/repo"
  const branch = process.env.GITHUB_OBSIDIAN_BRANCH || "main";
  const vaultPath = (process.env.GITHUB_OBSIDIAN_PATH || "notes").replace(/^\/|\/$/g, "");

  if (!token) throw new Error("GITHUB_TOKEN is not set — see .env.example");
  if (!repo) throw new Error("GITHUB_OBSIDIAN_REPO is not set — see .env.example");

  return { token, repo, branch, vaultPath };
}

export function isObsidianSyncConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OBSIDIAN_REPO);
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Lists every .md file under the configured vault path, using the Git
 * Trees API (one request for the whole repo tree, recursive) rather than
 * the Contents API — much cheaper than one request per folder for a vault
 * with any real depth.
 */
export async function listVaultFiles(): Promise<VaultFile[]> {
  const { token, repo, branch, vaultPath } = repoConfig();

  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GitHub tree fetch failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    tree: { path: string; type: string; sha: string }[];
    truncated?: boolean;
  };

  const prefix = `${vaultPath}/`;
  return json.tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix) && entry.path.endsWith(".md"))
    .map((entry) => ({ path: entry.path, sha: entry.sha }));
}

/** Fetches a single blob's raw content by sha (already known from listVaultFiles). */
export async function fetchBlobContent(sha: string): Promise<string> {
  const { token, repo } = repoConfig();

  const res = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${sha}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub blob fetch failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { content: string; encoding: string };
  if (json.encoding !== "base64") {
    throw new Error(`Unexpected blob encoding: ${json.encoding}`);
  }
  return Buffer.from(json.content, "base64").toString("utf-8");
}
