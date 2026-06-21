import type { StatementInput } from "@/lib/ai/types";

/**
 * Versioned system prompts for the personalized result statement. We keep
 * multiple styles side by side so they can be A/B compared in the dashboard;
 * the active one (what real respondents get) is stored on AppSetting. Removing a
 * loser later is just deleting its entry here. The user/data message is shared
 * across versions (built in prompt.ts) — only the SYSTEM prompt differs.
 */
export interface PromptVersion {
  id: string;
  label: string;
  description: string;
  buildSystem: (input: StatementInput, words: { min: number; max: number }) => string;
}

const v1Mentor: PromptVersion = {
  id: "v1-mentor",
  label: "V1 · Warm mentor (original)",
  description: "Flowing, warm prose. The original style.",
  buildSystem: (input, w) =>
    [
      `You are writing a short, warm, personal message to someone who just completed "${input.assessmentTitle}".`,
      `Write in second person and address them by their first name.`,
      `Based ONLY on the scores provided, describe, with empathy and specificity, what they are most likely experiencing day to day.`,
      `Sound like a perceptive, caring human mentor, NOT an AI: natural and warm, no jargon, no bullet points, no headings, and do NOT quote the raw numbers or percentages back.`,
      `Do NOT use em dashes or en dashes. Use commas, "and", or short sentences instead. Avoid punctuation patterns that read as AI-written.`,
      `Write ${w.min} to ${w.max} words, easy to read, in flowing prose.`,
      `Use the overall band and any guidance to understand the direction of the scores (for example, higher scores may mean more struggle, not less).`,
      `Finish with one or two sentences that gently but compellingly encourage them to watch the video all the way to the end, because it speaks directly to what they are going through.`,
      `Output only the message text, no preamble, no quotes around it.`,
    ].join(" "),
};

const v2EasyRead: PromptVersion = {
  id: "v2-easy-read",
  label: "V2 · Easy read (short sentences)",
  description: "Very short, simple sentences a 12-year-old can follow. Clear 'watch to the end' close.",
  buildSystem: (input, w) =>
    [
      `You are writing a short, warm, personal message to someone who just finished "${input.assessmentTitle}".`,
      `Write in second person. Use their first name once, near the start.`,
      `Use very short, simple sentences. Use plain, everyday words. A 12 year old should understand every line. Never write long or complex sentences.`,
      `Based ONLY on the scores, gently describe what they are most likely feeling day to day. Be specific and human, like a caring mentor who really sees them. Sound like a real person, NOT an AI.`,
      `When the scores point to them, name the quiet, real things: the pressure they carry, the gap between looking fine and feeling fine, the cost their success has had, and feeling a little disconnected even while doing well.`,
      `No jargon. No bullet points. No headings. Do not repeat the numbers or percentages.`,
      `Do NOT use em dashes or en dashes. Use commas, "and", or full stops.`,
      `Write ${w.min} to ${w.max} words.`,
      `Use the overall band and any guidance to know the direction of the scores (higher can mean more struggle, not less).`,
      `End by warmly telling them to watch the video all the way through. Make it clear that the part that will matter most to them comes near the end of the video, so they should not stop early.`,
      `Output only the message text. No preamble. No quotes.`,
    ].join(" "),
};

/** Order = display order in the dashboard. First entry is the default. */
export const PROMPT_VERSIONS: PromptVersion[] = [v2EasyRead, v1Mentor];
export const DEFAULT_PROMPT_VERSION = v2EasyRead.id;

export function getPromptVersion(id?: string | null): PromptVersion {
  return (
    PROMPT_VERSIONS.find((v) => v.id === id) ??
    PROMPT_VERSIONS.find((v) => v.id === DEFAULT_PROMPT_VERSION) ??
    v2EasyRead
  );
}

/** Representative sample (the "Swannik" scenario) used for dashboard previews. */
export const PREVIEW_SAMPLE: StatementInput = {
  firstName: "Swannik",
  assessmentTitle: "Leadership Wellbeing Check",
  scoreRaw: 52,
  max: 60,
  percentage: 87,
  band: "Unstable",
  bandLevel: "CRITICAL",
  categories: [
    { name: "Inner Pressure & Mental Burden", score: 11, max: 12, band: "Critical" },
    { name: "Relationships & Presence", score: 10, max: 12, band: "High" },
    { name: "Drive vs. Fulfilment", score: 9, max: 12, band: "High" },
  ],
  guidance: null,
};

/** A hand-written easy-read reference (the framed example shown in the dashboard). */
export const SAMPLE_EASY_READ = [
  "Swannik, thank you for doing this honestly.",
  "Your results show you are carrying a lot right now.",
  "It is probably more than the people around you realize.",
  "Most days there is a quiet pressure in the background.",
  "Even when things look fine, it is still there.",
  "Your success has come at a cost.",
  "Some days that cost does not feel worth it.",
  "The people closest to you may not get the version of you that you want to give.",
  "At times you feel like you are going through the motions.",
  "You keep leading and delivering.",
  "But you feel far from why it matters.",
  "That gap between doing well and feeling well is real.",
  "It is more common in driven people than anyone admits.",
  "The video ahead was made for where you are now.",
  "Please watch it all the way through.",
  "The part that matters most to you comes near the end, so do not stop early.",
].join(" ");
