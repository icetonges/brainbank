"use client";

import { useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface LlmChatStrings {
  chatTitle: string;
  chatIntro: string;
  chatPlaceholder: string;
  chatSend: string;
  chatThinking: string;
  chatEmpty: string;
}

/**
 * The /llm page's chatbox — a general-purpose chat against the local
 * model, distinct from the note-drafting AiAssistPanel embedded on /new
 * (same backend route, /api/ai/assist, but sent with context: "knowledge"
 * so tasks.ts uses KNOWLEDGE_CHAT_SYSTEM_PROMPT instead of the note-assist
 * one — see streamAssist in src/lib/ai/tasks.ts). No model picker here:
 * local/default is currently the only registered model (see models.ts),
 * so a dropdown with one option would just be clutter: the status card
 * above this panel already shows which model is live.
 */
export function LlmChatPanel({ s }: { s: LlmChatStrings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context: "knowledge" }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => "AI request failed"));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
        {s.chatTitle}
      </h2>
      <p className="text-sm text-fg-secondary">{s.chatIntro}</p>

      <div className="flex min-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-bg p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-fg-secondary">{s.chatEmpty}</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="text-sm">
              <span className="font-semibold text-fg-secondary">
                {m.role === "user" ? "You" : "AI"}:{" "}
              </span>
              <span className="whitespace-pre-wrap text-fg">{m.content}</span>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

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
          placeholder={s.chatPlaceholder}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
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
