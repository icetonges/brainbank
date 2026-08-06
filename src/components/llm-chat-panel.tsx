"use client";

import { useEffect, useRef, useState } from "react";
import { MODELS, DEFAULT_MODEL_ID, type ModelId } from "@/lib/ai/models";

type MessageStatus = "thinking" | "streaming" | "done";

interface UsageInfo {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // The rest only apply to assistant messages, and only get set once a
  // request for that message has actually started.
  status?: MessageStatus;
  sentAt?: number;
  firstTokenAt?: number;
  doneAt?: number;
  usage?: UsageInfo;
}

interface LlmChatStrings {
  chatTitle: string;
  chatIntro: string;
  chatPlaceholder: string;
  chatSend: string;
  chatThinking: string;
  chatEmpty: string;
  chatFirstToken: string;
  chatTotalTime: string;
  chatTokensIn: string;
  chatTokensOut: string;
  chatTokensTotal: string;
  modelLabel: string;
  modelHeavyWarning: string;
  playAudio: string;
  stopAudio: string;
  audioLoading: string;
  micRecord: string;
  micStop: string;
  micTranscribing: string;
}

// Mirrors USAGE_TRAILER_PREFIX/SUFFIX in src/lib/ai/tasks.ts exactly — see
// the comment on usageTrailer() there for why token usage rides along as a
// stripped trailer on the plain-text stream instead of a separate
// response field. Keep these two in sync if the format ever changes.
const USAGE_TRAILER_PREFIX = "\n\n<!--BRAINBANK:USAGE:";
const USAGE_TRAILER_SUFFIX = "-->";

/** Splits the trailer (if present) off the raw accumulated stream text.
 * While the trailer has started but not yet fully arrived (its closing
 * "-->" hasn't shown up in a chunk yet), `visible` simply stops just
 * before it — so the marker's own bytes never flash on screen mid-stream,
 * they just appear once the message is otherwise complete. */
function splitUsageTrailer(raw: string): { visible: string; usage: UsageInfo | null } {
  const idx = raw.indexOf(USAGE_TRAILER_PREFIX);
  if (idx === -1) return { visible: raw, usage: null };
  const visible = raw.slice(0, idx);
  const rest = raw.slice(idx + USAGE_TRAILER_PREFIX.length);
  const endIdx = rest.indexOf(USAGE_TRAILER_SUFFIX);
  if (endIdx === -1) return { visible, usage: null };
  try {
    const usage = JSON.parse(rest.slice(0, endIdx)) as UsageInfo;
    return { visible, usage };
  } catch {
    return { visible, usage: null };
  }
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The /llm page's chatbox — a general-purpose chat against the local
 * model, distinct from the note-drafting AiAssistPanel embedded on /new
 * (same backend route, /api/ai/assist, but sent with context: "knowledge"
 * so tasks.ts uses KNOWLEDGE_CHAT_SYSTEM_PROMPT instead of the note-assist
 * one — see streamAssist in src/lib/ai/tasks.ts). Three local models are
 * now registered (models.ts, per HANDOFF-FOR-WINDOWS.md §2), so there's a
 * picker below the intro text — same pattern as the classroom composer's
 * (validated server-side too: /api/ai/assist/route.ts rejects an unknown
 * modelId with a 400 before it ever reaches streamAssist).
 *
 * Shows, per assistant reply: a live "thinking…" status before the first
 * token arrives, time-to-first-token and total elapsed time once it's
 * done, and token usage (input/output/total) parsed out of the trailer
 * streamAssist appends for this context — see splitUsageTrailer above.
 */
export function LlmChatPanel({ s }: { s: LlmChatStrings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Applies to the NEXT message sent — each request is independent (the
  // whole transcript is resent every time, see send() below), so changing
  // this mid-conversation is safe and just means "use this model from here
  // on," not a retroactive change to earlier replies.
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
  const abortRef = useRef<AbortController | null>(null);

  // Per-reply "🔊 Play" — one shared <audio> element rather than one per
  // message, so starting a new reply's playback naturally stops whatever
  // was already playing (setting .src on it does that for free).
  const audioElRef = useRef<HTMLAudioElement>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [audioLoadingIndex, setAudioLoadingIndex] = useState<number | null>(null);

  // 🎤 mic input — records to a Blob via MediaRecorder, then posts it to
  // /api/tasks/transcribe and drops the result into the text input rather
  // than auto-sending, so a mis-transcription can be edited before it's
  // sent like any other typed message.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Drives the live "Xs" readout on the in-flight message. Only ticks
  // while something is actually pending, so it's not running idle.
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setPending(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const sentAt = Date.now();
    setNow(sentAt);
    setMessages((prev) => [...prev, { role: "assistant", content: "", status: "thinking", sentAt }]);

    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          context: "knowledge",
          modelId,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => "AI request failed"));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      let firstTokenAt: number | undefined;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstTokenAt === undefined) firstTokenAt = Date.now();
        raw += decoder.decode(value, { stream: true });
        const { visible, usage } = splitUsageTrailer(raw);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: visible,
            status: "streaming",
            sentAt,
            firstTokenAt,
            usage: usage ?? undefined,
          };
          return copy;
        });
      }

      const { visible, usage } = splitUsageTrailer(raw);
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: visible,
          status: "done",
          sentAt,
          firstTokenAt,
          doneAt: Date.now(),
          usage: usage ?? undefined,
        };
        return copy;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Drop the placeholder bubble on failure instead of leaving a
      // permanently-empty "thinking" message sitting in the transcript.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  /** Fetches TTS audio for one reply and plays it — clicking the button on
   *  the message that's currently playing pauses it instead of restarting. */
  async function playMessage(index: number, text: string) {
    if (playingIndex === index) {
      audioElRef.current?.pause();
      setPlayingIndex(null);
      return;
    }
    setError(null);
    setAudioLoadingIndex(index);
    try {
      const res = await fetch("/api/tasks/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Text-to-speech failed"));
      const blob = await res.blob();
      const el = audioElRef.current;
      if (!el) return;
      if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioObjectUrlRef.current = url;
      el.src = url;
      el.onended = () => setPlayingIndex(null);
      await el.play();
      setPlayingIndex(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text-to-speech failed");
    } finally {
      setAudioLoadingIndex(null);
    }
  }

  /** Starts/stops a mic recording; the actual transcribe-and-fill-input
   *  work happens in the recorder's onstop handler once the final chunk
   *  is available. */
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.set("file", blob, "voice-input.webm");
          const res = await fetch("/api/tasks/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error(await res.text().catch(() => "Transcription failed"));
          const { text } = (await res.json()) as { text: string };
          if (text?.trim()) setInput((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
        {s.chatTitle}
      </h2>
      <p className="text-sm text-fg-secondary">{s.chatIntro}</p>

      <div className="flex items-center gap-2">
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value as ModelId)}
          aria-label={s.modelLabel}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.id === DEFAULT_MODEL_ID ? " ★" : ""}
            </option>
          ))}
        </select>
      </div>
      {MODELS.find((m) => m.id === modelId)?.heavy && (
        <p className="text-sm text-warn">⚠️ {s.modelHeavyWarning}</p>
      )}

      <div className="flex min-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-bg p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-fg-secondary">{s.chatEmpty}</p>
        ) : (
          messages.map((m, i) => {
            const isAssistant = m.role === "assistant";
            const elapsedMs =
              isAssistant && m.sentAt
                ? (m.doneAt ?? (m.status !== "done" ? now : m.sentAt)) - m.sentAt
                : undefined;
            const firstTokenMs =
              isAssistant && m.sentAt && m.firstTokenAt ? m.firstTokenAt - m.sentAt : undefined;
            const hasUsage =
              m.usage && (m.usage.inputTokens != null || m.usage.outputTokens != null || m.usage.totalTokens != null);

            return (
              <div key={i} className="text-sm">
                <span className="font-semibold text-fg-secondary">
                  {m.role === "user" ? "You" : "AI"}:{" "}
                </span>
                {isAssistant && m.status === "thinking" ? (
                  <span className="inline-flex items-center gap-1.5 italic text-fg-secondary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
                    {s.chatThinking}
                    {elapsedMs !== undefined ? ` ${formatSeconds(elapsedMs)}` : ""}
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap text-fg">{m.content}</span>
                )}

                {isAssistant && (m.status === "streaming" || m.status === "done") && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-secondary">
                    {elapsedMs !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        {m.status === "streaming" && (
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
                        )}
                        {firstTokenMs !== undefined && `${formatSeconds(firstTokenMs)} ${s.chatFirstToken} · `}
                        {formatSeconds(elapsedMs)} {s.chatTotalTime}
                      </span>
                    )}
                    {hasUsage && m.usage && (
                      <span>
                        {m.usage.inputTokens ?? "?"} {s.chatTokensIn} / {m.usage.outputTokens ?? "?"} {s.chatTokensOut}
                        {m.usage.totalTokens != null ? ` (${m.usage.totalTokens} ${s.chatTokensTotal})` : ""}
                      </span>
                    )}
                    {m.status === "done" && m.content.trim() && (
                      <button
                        type="button"
                        onClick={() => playMessage(i, m.content)}
                        disabled={audioLoadingIndex === i}
                        title={playingIndex === i ? s.stopAudio : s.playAudio}
                        aria-label={playingIndex === i ? s.stopAudio : s.playAudio}
                        className="rounded px-1.5 py-0.5 text-accent hover:bg-accent/10 disabled:opacity-50"
                      >
                        {audioLoadingIndex === i ? s.audioLoading : playingIndex === i ? "⏸" : "🔊"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Shared playback element for every "🔊 Play" button above — kept
          out of the message loop so there's only ever one <audio>, and
          starting a new reply's playback naturally interrupts whatever
          was already playing. */}
      <audio ref={audioElRef} className="hidden" />

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={transcribing ? s.micTranscribing : s.chatPlaceholder}
          disabled={transcribing}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="button"
          onClick={toggleRecording}
          disabled={transcribing}
          title={recording ? s.micStop : s.micRecord}
          aria-label={recording ? s.micStop : s.micRecord}
          aria-pressed={recording}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            recording
              ? "border-danger bg-danger/15 text-danger"
              : "border-border text-fg hover:border-accent hover:text-accent"
          }`}
        >
          {recording ? "⏹" : "🎤"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? s.chatThinking : s.chatSend}
        </button>
      </div>
    </div>
  );
}
