/** Supported LLM providers. The provider is configurable per the AI rules. */
export type AiProvider = "claude" | "openai" | "gemini";

export const AI_PROVIDERS: AiProvider[] = ["claude", "openai", "gemini"];

/** Sensible default model per provider when the admin leaves the model blank. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

/** One entry in a model dropdown. */
export interface AiModelOption {
  value: string;
  label: string;
}

/** FALLBACK model list per provider. The AI settings dropdown reads the live list from
 *  the provider (lib/ai/model-catalog.ts) and only shows this one when there is no key
 *  or the provider cannot be reached, so nobody needs to keep it current by hand. */
export const MODELS_BY_PROVIDER: Record<AiProvider, AiModelOption[]> = {
  claude: [
    { value: "claude-opus-5-5", label: "Claude Opus 5.5 - most capable" },
    { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 - balanced" },
    { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 - fast, cheapest" },
    { value: "claude-fable-5-2", label: "Claude Fable 5.2" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini - fast, cheapest" },
    { value: "gpt-4o", label: "GPT-4o - balanced" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-5", label: "GPT-5 - most capable" },
  ],
  gemini: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash - fast, cheapest" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro - balanced" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro - most capable" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
};

export function isAiProvider(v: string): v is AiProvider {
  return (AI_PROVIDERS as string[]).includes(v);
}

/** Model id families per provider. A model saved for one provider must never be sent
 *  to another's key: a stale "gpt-4o" against a Claude key fails every statement. */
const MODEL_FAMILY: Record<AiProvider, RegExp> = {
  claude: /^claude-/,
  openai: /^(gpt-|o\d|chatgpt-)/,
  gemini: /^gemini-/,
};

export function modelFitsProvider(model: string, provider: AiProvider): boolean {
  return MODEL_FAMILY[provider].test(model.trim());
}

/** Resolved, decrypted config used to call a provider. */
export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  guidance: string | null;
  /** Active prompt version id (see prompt-versions.ts); null => default. */
  promptVersion: string | null;
  /**
   * Whose provider key is paying for this call.
   *
   * True = the platform's, so the call costs THIS business money and belongs in the
   * expense column. False = the tenant brought their own key and spends their own.
   * Recorded on every AiUsage row so the Accounts page can tell the two apart; without
   * it, a tenant on their own key would inflate our costs and understate profit.
   */
  onPlatformKey: boolean;
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
  /** Overall band LEVEL (LOW/MEDIUM/HIGH/CRITICAL) - used verbatim in the message. */
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
