import { YoutubeTranscript } from "youtube-transcript";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20000;

interface OEmbedResponse {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

/** oEmbed (title/author/thumbnail) needs no API key at all. The transcript
 * fetch is best-effort — captions can be disabled, age/region-restricted,
 * or YouTube can just rate-limit the unofficial endpoint this library uses
 * (flagged as a real risk in PLAN.md §11) — so a failed transcript falls
 * back to summarizing from the title/author alone instead of failing the
 * whole ingestion. */
export async function extractFromYoutube(url: string): Promise<ExtractedSource> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const oembedRes = await fetch(oembedUrl);
  if (!oembedRes.ok) {
    throw new Error(`Not a reachable YouTube video: ${url}`);
  }
  const oembed: OEmbedResponse = await oembedRes.json();

  let transcriptText = "";
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    transcriptText = transcript.map((t) => t.text).join(" ");
  } catch {
    transcriptText = "";
  }

  const text = transcriptText
    ? transcriptText.slice(0, MAX_CHARS)
    : `${oembed.title}, by ${oembed.author_name}. No transcript is available for this video (captions may be disabled) — this note is based on the title and channel only.`;

  return {
    title: oembed.title,
    text,
    imageUrl: oembed.thumbnail_url,
  };
}
