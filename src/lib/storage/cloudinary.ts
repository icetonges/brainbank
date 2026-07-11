import { createHash } from "node:crypto";

// Cloudinary handles images and video: transformations, thumbnails, and a
// CDN built for rendering rich media (PLAN.md §2/§9), which is what it's
// actually good at — raw documents go to R2 instead (see r2.ts). We sign
// uploads ourselves with plain Node crypto rather than pulling in the full
// `cloudinary` SDK, since all we need server-side is one signature.

export interface CloudinarySignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export function signCloudinaryUpload(folder: string): CloudinarySignedUpload {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env.local.",
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  // Cloudinary's signing scheme: sort every param you're sending (besides
  // file/api_key/signature/cloud_name), join as key=value&..., append the
  // api secret, sha1 the whole thing.
  const paramsToSign: Record<string, string | number> = { folder, timestamp };
  const toSign = Object.keys(paramsToSign)
    .sort()
    .map((key) => `${key}=${paramsToSign[key]}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + apiSecret).digest("hex");

  return { cloudName, apiKey, timestamp, signature, folder };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}
