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
  label: "V2 · Meaning (what the result means for them)",
  description:
    "Reads the per-category bands and the actual answers, then tells them what it MEANS for their real life. Ends with a hopeful turn to the training video.",
  buildSystem: (input, w) =>
    [
      `You are writing a short, deeply personal message to someone who just finished "${input.assessmentTitle}".`,
      `They have ALREADY seen their scores. Do NOT restate or reword the numbers. Your job is to tell them what those scores MEAN for their real life right now.`,
      `Write in second person. Use their first name once, near the start. Be warm but direct, like a perceptive mentor who clearly sees them. Sound like a real person, NOT an AI.`,
      `You are given each category, its band word, and the individual questions with the answer they chose. Read the high and critical categories and their strongest answers, and turn them into the concrete, day to day consequences this person is most likely living: the pressure they carry, the cost their success has had, what it is doing to their closest relationships, to their presence and leadership, and to their sense of meaning and stability.`,
      `Name these consequences specifically, in a natural flow, not as a list and not mechanically one category after another. Use their own band words, for example Critical or Unstable, where they fit. Never quote the raw numbers or percentages.`,
      `Use short, clear sentences and plain, everyday words. A 12 year old should understand every line. No jargon, no bullet points, no headings.`,
      `Do NOT use em dashes or en dashes. Use commas, "and", or full stops.`,
      `Write ${w.min} to ${w.max} words, in TWO short paragraphs.`,
      `Use the overall band and any guidance to know the direction of the scores; here a higher score usually means more struggle, not less.`,
      `First paragraph: the meaning, what they are going through, building to the deepest cost such as losing their sense of meaning, purpose or inner stability.`,
      `Second paragraph: a short, hopeful turn. Tell them this is exactly where you can help them, and that you walk them through it in the training video below, so it is worth their full attention.`,
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
    {
      name: "Inner Pressure & Mental Burden",
      score: 11,
      max: 12,
      band: "Critical",
      questions: [
        { text: "How often is your mind racing even when you try to rest?", answer: "Almost always", score: 4, max: 4 },
        { text: "How heavy does the weight of responsibility feel?", answer: "Very heavy", score: 4, max: 4 },
        { text: "How easily can you switch off after work?", answer: "Rarely", score: 3, max: 4 },
      ],
    },
    {
      name: "Relationships & Presence",
      score: 10,
      max: 12,
      band: "High",
      questions: [
        { text: "Are you fully present with the people closest to you?", answer: "Seldom", score: 4, max: 4 },
        { text: "Do those close to you get the best of you or what is left?", answer: "What is left", score: 4, max: 4 },
        { text: "How connected do you feel to loved ones lately?", answer: "Somewhat distant", score: 2, max: 4 },
      ],
    },
    {
      name: "Drive vs. Fulfilment",
      score: 9,
      max: 12,
      band: "High",
      questions: [
        { text: "Does your success still feel meaningful?", answer: "Less and less", score: 4, max: 4 },
        { text: "How often do you feel you are going through the motions?", answer: "Often", score: 3, max: 4 },
        { text: "Do you remember why you started?", answer: "It is fading", score: 2, max: 4 },
      ],
    },
  ],
  guidance: null,
};

/** A hand-written reference (the framed example shown in the dashboard) in the
 *  current "meaning" style: what the result means, then a turn to the training. */
export const SAMPLE_EASY_READ = [
  "Swannik, the truth is you are carrying far more than the people around you can see.",
  "The pressure rarely switches off, even on the good days.",
  "Your success has been real, but it has quietly cost you.",
  "The people closest to you are getting the tired version of you, not the one you want to give.",
  "You keep showing up and leading, yet most days you feel far from why any of it mattered.",
  "That steadiness and sense of purpose you once had is slipping, and that is the part that hurts the most.",
  "This is exactly where I can help you.",
  "I walk you through it, step by step, in the training video below, so please give it your full attention.",
].join(" ");
