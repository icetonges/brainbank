"use client";

import { useState, useRef } from "react";
import { DEFAULT_MODEL_ID, type ModelId } from "@/lib/ai/models";
import { ModelPicker } from "./model-picker";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// AI assist, on top of the LLM chain: this panel never calls a provider
// directly, it POSTs to /api/ai/assist, which runs streamAssist() from
// src/lib/ai/tasks.ts — the same chain every other AI feature in the app
// (translate, summarize, tag suggestions) goes through.
export function AiAssistPanel() {
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
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
        body: JSON.stringify({ messages: nextMessages, modelId }),
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
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          AI Assist
        </h2>
        <ModelPicker value={modelId} onChange={setModelId} />
      </div>

      {messages.length > 0 && (
        <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-bg p-3">
          {messages.map((m, i) => (
            <div key={i} className="text-sm">
              <span className="font-semibold text-fg-secondary">
                {m.role === "user" ? "You" : "AI"}:{" "}
              </span>
              <span className="whitespace-pre-wrap text-fg">{m.content}</span>
            </div>
          ))}
        </div>
      )}

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
          placeholder="Ask for help drafting what / how / why..."
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? "Thinking..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
