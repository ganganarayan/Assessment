/** Supported LLM providers. The provider is configurable per the AI rules. */
export type AiProvider = "claude" | "openai" | "gemini";

export const AI_PROVIDERS: AiProvider[] = ["claude", "openai", "gemini"];

/** Sensible default model per provider when the admin leaves the model blank. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

export function isAiProvider(v: string): v is AiProvider {
  return (AI_PROVIDERS as string[]).includes(v);
}

/** Resolved, decrypted config used to call a provider. */
export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  guidance: string | null;
}

/** The raw signals passed to the model — RAW SCORES ONLY, no admin interpretation. */
export interface StatementInput {
  firstName: string | null;
  assessmentTitle: string;
  scoreRaw: number;
  max: number;
  percentage: number;
  /** Overall band word (e.g. "Unstable") — anchors the scoring direction. */
  band: string | null;
  categories: { name: string; score: number; max: number }[];
  /** Admin-set tone / scoring-direction note (optional). */
  guidance?: string | null;
}
