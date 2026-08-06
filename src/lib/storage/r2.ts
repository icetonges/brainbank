import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible, so we talk to it with the AWS SDK pointed
// at R2's endpoint. Used for anything that isn't an image/video — PDFs,
// docx, xlsx, md — including files well over Cloudinary's comfort zone
// (PLAN.md §2/§7: 50MB+ documents). The browser uploads straight to R2
// using a short-lived presigned URL; the file bytes never pass through a
// Vercel function (which caps request bodies at 4.5MB).

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local.",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export interface R2UploadTarget {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/** A presigned PUT URL the browser can upload directly to, plus the
 * eventual public URL (via your R2 bucket's public/custom domain). */
export async function createR2UploadTarget(
  key: string,
  contentType: string,
): Promise<R2UploadTarget> {
  const bucket = process.env.R2_BUCKET;
  const publicUrlBase = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrlBase) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_BUCKET and R2_PUBLIC_URL in .env.local.",
    );
  }

  const client = r2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `${publicUrlBase.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, publicUrl, key };
}

/** Uploads bytes straight to R2 from server code and returns the public
 * URL — for content generated server-side (TTS audio, etc.) that never
 * needs the presigned browser round-trip createR2UploadTarget exists for,
 * since the bytes are already sitting in the Vercel function's memory. */
export async function uploadBufferToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ publicUrl: string }> {
  const bucket = process.env.R2_BUCKET;
  const publicUrlBase = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrlBase) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_BUCKET and R2_PUBLIC_URL in .env.local.",
    );
  }

  const client = r2Client();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return { publicUrl: `${publicUrlBase.replace(/\/$/, "")}/${key}` };
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL,
  );
}
