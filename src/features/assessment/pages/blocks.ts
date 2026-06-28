/**
 * Page-builder block vocabulary. Pages (AssessmentPage) hold ordered, typed blocks
 * (PageBlock) whose `config` is type-specific JSON — so new block types never touch
 * the schema. Plain types (safe on client + server). Static blocks the admin fills;
 * dynamic blocks render from the respondent's result.
 */

export type BlockType =
  | "text" // { heading?, content }
  | "video" // { embedUrl }
  | "pay_button" // { label } -> opens the configured payment
  | "overall_band" // { prefix? } dynamic: matched overall band word
  | "band_sentence" // { byBand: { LOW, MEDIUM, HIGH, CRITICAL } } dynamic: per-band line
  | "category_scores"; // { heading? } dynamic: categories + bands, scores blurred

export const BLOCK_TYPES: { type: BlockType; label: string; dynamic: boolean }[] = [
  { type: "text", label: "Text / write-up", dynamic: false },
  { type: "video", label: "Video embed", dynamic: false },
  { type: "pay_button", label: "Payment button", dynamic: false },
  { type: "overall_band", label: "Overall band (dynamic)", dynamic: true },
  { type: "band_sentence", label: "Band sentence (dynamic, per band)", dynamic: true },
  { type: "category_scores", label: "Category breakdown — scores blurred (dynamic)", dynamic: true },
];

export const BAND_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type BandLevel = (typeof BAND_LEVELS)[number];

export interface TextConfig {
  heading?: string;
  content?: string;
}
export interface VideoConfig {
  embedUrl?: string;
}
export interface PayButtonConfig {
  label?: string;
}
export interface OverallBandConfig {
  prefix?: string;
}
export interface BandSentenceConfig {
  byBand?: Partial<Record<BandLevel, string>>;
}
export interface CategoryScoresConfig {
  heading?: string;
}

export type BlockConfig =
  | TextConfig
  | VideoConfig
  | PayButtonConfig
  | OverallBandConfig
  | BandSentenceConfig
  | CategoryScoresConfig;

export function isBlockType(v: string): v is BlockType {
  return BLOCK_TYPES.some((b) => b.type === v);
}

/** A page + its blocks, as rendered publicly and edited in the admin builder. */
export interface PageBlockData {
  id: string;
  type: BlockType;
  order: number;
  config: Record<string, unknown>;
}
export interface AssessmentPageData {
  id: string;
  order: number;
  title: string | null;
  blocks: PageBlockData[];
}

/** Default config when adding a new block of a type (so the editor has fields). */
export function defaultConfig(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { heading: "", content: "" };
    case "video":
      return { embedUrl: "" };
    case "pay_button":
      return { label: "Pay to unlock" };
    case "overall_band":
      return { prefix: "Your result:" };
    case "band_sentence":
      return { byBand: {} };
    case "category_scores":
      return { heading: "Your category breakdown" };
    default:
      return {};
  }
}
