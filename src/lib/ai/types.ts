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
  /** Active prompt version id (see prompt-versions.ts); null => default. */
  promptVersion: string | null;
}

/** The signals passed to the model for one personalized statement. */
export interface StatementInput {
  firstName: string | null;
  /** The respondent's profession (sets the lens/direction of the message). */
  profession?: string | null;
  assessmentTitle: string;
  scoreRaw: number;
  max: number;
  percentage: number;
  /** Overall band TITLE (e.g. "Unstable"). */
  band: string | null;
  /** Overall band LEVEL (LOW/MEDIUM/HIGH/CRITICAL) — used verbatim in the message. */
  bandLevel?: string | null;
  categories: {
    name: string;
    score: number;
    max: number;
    band?: string | null;
    meaning?: string | null;
    /** The answered questions behind this category (text + chosen answer + score). */
    questions?: { text: string; answer?: string | null; score: number; max: number }[];
  }[];
  /** Admin-set tone / scoring-direction note (optional). */
  guidance?: string | null;
  /** Admin's free-text correction/steering for a regenerate (overrides defaults). */
  instruction?: string | null;
}
