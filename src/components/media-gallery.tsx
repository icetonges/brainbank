import { deleteMediaAction } from "@/app/notes/[slug]/actions";
import type { MediaKind } from "@/lib/db/schema";

export interface MediaItem {
  id: number;
  kind: MediaKind;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

export function MediaGallery({
  items,
  slug,
  canEdit,
}: {
  items: MediaItem[];
  slug: string;
  canEdit: boolean;
}) {
  if (items.length === 0) return null;

  const images = items.filter((m) => m.kind === "image");
  const videos = items.filter((m) => m.kind === "video");
  const files = items.filter((m) => m.kind !== "image" && m.kind !== "video");

  return (
    <div className="flex flex-col gap-4">
      {(images.length > 0 || videos.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((m) => (
            <MediaTile key={m.id} item={m} slug={slug} canEdit={canEdit}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt=""
                className="h-40 w-full rounded-md border border-border object-cover"
              />
            </MediaTile>
          ))}
          {videos.map((m) => (
            <MediaTile key={m.id} item={m} slug={slug} canEdit={canEdit}>
              <video
                src={m.url}
                controls
                className="h-40 w-full rounded-md border border-border bg-bg object-cover"
              />
            </MediaTile>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
            >
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm text-accent hover:underline"
              >
                {filenameFromUrl(m.url)}
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-fg-secondary">{formatSize(m.sizeBytes)}</span>
                {canEdit && <DeleteMediaButton mediaId={m.id} slug={slug} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaTile({
  item,
  slug,
  canEdit,
  children,
}: {
  item: MediaItem;
  slug: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      {children}
      {canEdit && (
        <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DeleteMediaButton mediaId={item.id} slug={slug} />
        </div>
      )}
    </div>
  );
}

function DeleteMediaButton({ mediaId, slug }: { mediaId: number; slug: string }) {
  const action = deleteMediaAction.bind(null, mediaId, slug);
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-secondary hover:text-danger border border-border"
        aria-label="Remove media"
        title="Remove"
      >
        ✕
      </button>
    </form>
  );
}
