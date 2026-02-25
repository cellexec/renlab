"use client";

const MODELS = [
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
] as const;

export type Model = (typeof MODELS)[number]["value"];

interface ModelSelectProps {
  value: Model;
  onChange: (model: Model) => void;
  disabled?: boolean;
}

export function ModelSelect({ value, onChange, disabled }: ModelSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Model)}
      disabled={disabled}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {MODELS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
