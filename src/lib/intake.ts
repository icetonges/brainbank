const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const ALLOWED_UPLOADS: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword", "application/octet-stream"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  ".csv": ["text/csv", "application/vnd.ms-excel", "application/octet-stream"],
  ".md": ["text/markdown", "text/plain", "application/octet-stream"],
  ".txt": ["text/plain", "application/octet-stream"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
  ".mov": ["video/quicktime"],
};

export function detectPrimaryLanguage(text: string): "en" | "zh" {
  const meaningful = text.match(/[A-Za-z\u3400-\u9fff]/g) ?? [];
  if (meaningful.length === 0) return "en";
  const chinese = meaningful.filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  return chinese / meaningful.length >= 0.2 ? "zh" : "en";
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^169\.254\./.test(host) || /^0\./.test(host)) return true;
  return false;
}

export function assertSafePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || isPrivateHostname(url.hostname)) {
    throw new Error("Only public HTTP or HTTPS URLs are supported");
  }
  return url;
}

export function validateUploadMetadata(input: {
  noteId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}) {
  if (!Number.isSafeInteger(input.noteId) || input.noteId <= 0) throw new Error("Invalid note id");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be between 1 byte and 100 MB");
  }
  const extension = input.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  const allowedMimes = extension ? ALLOWED_UPLOADS[extension] : undefined;
  if (!allowedMimes || !allowedMimes.includes(input.mimeType.toLowerCase())) {
    throw new Error("This file type is not supported");
  }
}

export { MAX_UPLOAD_BYTES };
