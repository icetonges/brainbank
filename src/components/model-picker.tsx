"use client";

import { MODELS, DEFAULT_MODEL_ID, type ModelId, type ProviderId } from "@/lib/ai/models";

const PROVIDER_ORDER: ProviderId[] = ["google", "groq", "anthropic"];

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: ModelId;
  onChange: (id: ModelId) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ModelId)}
      className={
        "rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-fg outline-none focus:border-accent " +
        (className ?? "")
      }
      aria-label="AI model"
    >
      {PROVIDER_ORDER.map((provider) => {
        const models = MODELS.filter((m) => m.provider === provider);
        if (models.length === 0) return null;
        return (
          <optgroup key={provider} label={models[0].providerLabel}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isFree ? " (free)" : ""}
                {m.id === DEFAULT_MODEL_ID ? " ★" : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
