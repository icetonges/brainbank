import { auth } from "@/auth";
import { createR2UploadTarget } from "@/lib/storage/r2";
import { signCloudinaryUpload } from "@/lib/storage/cloudinary";
import { providerForMimeType } from "@/lib/storage/media-kind";
import { validateUploadMetadata } from "@/lib/intake";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

interface SignRequestBody {
  noteId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: SignRequestBody;
  try {
    body = await req.json();
    validateUploadMetadata(body);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid upload", { status: 400 });
  }

  const note = await db.query.notes.findFirst({ where: eq(notes.id, body.noteId) });
  if (!note) return new Response("Note not found", { status: 404 });

  const provider = providerForMimeType(body.mimeType);

  try {
    if (provider === "cloudinary") {
      const folder = `brainbank/notes/${body.noteId}`;
      const signed = signCloudinaryUpload(folder);
      return Response.json({
        provider: "cloudinary" as const,
        uploadUrl: `https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`,
        fields: {
          api_key: signed.apiKey,
          timestamp: String(signed.timestamp),
          signature: signed.signature,
          folder: signed.folder,
        },
      });
    }

    const key = `notes/${body.noteId}/${Date.now()}-${sanitizeFilename(body.filename)}`;
    const target = await createR2UploadTarget(key, body.mimeType);
    return Response.json({
      provider: "r2" as const,
      uploadUrl: target.uploadUrl,
      publicUrl: target.publicUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload signing failed";
    return new Response(message, { status: 500 });
  }
}
