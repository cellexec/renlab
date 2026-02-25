import type { Model } from "./components/ModelSelect";

export interface SubAgent {
  id: string;
  name: string;
  description: string;
  model: Model;
  systemPrompt: string;
  color: string; // tailwind bg class for badge
}

export const AGENT_COLORS = [
  "bg-zinc-600",
  "bg-blue-600",
  "bg-purple-600",
  "bg-amber-600",
  "bg-red-600",
  "bg-emerald-600",
  "bg-pink-600",
  "bg-cyan-600",
] as const;
