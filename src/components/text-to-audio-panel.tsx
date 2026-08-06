"use client";

import { useRef, useState } from "react";

export interface TextToAudioStrings {
  title: string;
  intro: string;
  placeholder: string;
  generate: string;
  generating: string;
  download: string;
  videoComingSoon: string;
}

const MAX_CHARS = 4000;

/**
 * Standalone "paste text, get audio" tool on /llm — separate from the
 * per-reply 🔊 button in llm-chat-panel.tsx, which only ever reads back
 * something the model already said. This reads back whatever you type,
 * same /api/tasks/speech endpoint either way. Video generation has no
 * backing route yet (agent-server's LTX-2.3 integration is still a
 * documented TODO — see models.ts's MEDIA MODELS comment), so that
 * button stays visibly present but disabled rather than silently absent,
 * so it's obvious the capability is coming, not forgotten.
 */
export function TextToAudioPanel({ s }: { s: TextToAudioStrings }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  async function generate() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Text-to-speech failed"));
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text-to-speech failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">{s.title}</h2>
      <p className="text-sm text-fg-secondary">{s.intro}</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        placeholder={s.placeholder}
        rows={4}
        className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-secondary">
          {text.length} / {MAX_CHARS}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title={s.videoComingSoon}
            className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary opacity-50"
          >
            🎬 {s.videoComingSoon}
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={busy || !text.trim()}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {busy ? s.generating : `🔊 ${s.generate}`}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {audioUrl && (
        <div className="flex flex-col gap-2">
          <audio src={audioUrl} controls className="w-full" />
          <a href={audioUrl} download="speech.mp3" className="self-start text-xs text-accent hover:underline">
            {s.download}
          </a>
        </div>
      )}
    </div>
  );
}
