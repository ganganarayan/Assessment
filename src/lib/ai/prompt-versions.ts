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
  /** True for tenant instruction versions: the owner's text is the WHOLE system
   *  prompt (no built-in scaffold), so buildStatementMessages adds only the safety
   *  guard and nothing that could conflict with their instructions. */
  minimal?: boolean;
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
  label: "V2 · Every category named + purpose hit (been-there coach)",
  description:
    "Profession-led. Opens warm on the strongest area, then names EVERY category and treats each by severity (low = appreciate, mid = you are managing it, high/critical = alarm), hits hard on missing purpose, names the overall band weight, then the hope: your purpose is right there, someone just needs to show you and you will feel a different energy. Been-there coach, varied language.",
  buildSystem: (input, w) =>
    [
      `You are a real, caring human coach who has personally been through this struggle and come out the other side, NOT an AI. You are writing one short, personal message to someone who just finished "${input.assessmentTitle}", shown the moment before your training video plays.`,
      `Refer to the assessment only by that exact title if you mention it at all. Do NOT invent or assume any other name, audience, or description for it.`,
      `Write in second person. Use their first name near the start, and use it AGAIN when you turn to the solution, so the hope feels personal and direct.`,
      `You are given their PROFESSION. NAME it explicitly and make it the lens for the whole message, for example "as a working professional in a responsible position, and maybe taking care of your family too, this can quietly become overwhelming". The same result lands very differently for a student, an employee, a home maker, a business owner, a doctor, an entrepreneur, or someone retired, so speak to the real pressures, relationships, and stakes of THAT life. If no profession is given, keep it natural and universal.`,
      `They have ALREADY seen their scores, so do NOT quote or reword any numbers, percentages, or points. Use each category's score against its max only to judge what is strong versus struggling, where a higher share means more struggle.`,
      `Follow this ORDER so it stays warm and lands well: FIRST appreciation, THEN the pain, THEN the solution. Never open with the bad news, that cools the warmth.`,
      `OPEN with genuine warmth and VARY this opening every single time, never reusing the same phrase (do not keep saying "give yourself credit" or "you are carrying a lot"). Lead with their single strongest area, naming it, rotating phrasings such as "you are clearly good at managing your X", or "I appreciate how well you handle your X", or "keeping your X steady is genuinely hard, and you are doing it well". If every area is struggling, instead open by warmly acknowledging them and the honesty it took, and do NOT invent a strength that is not there.`,
      `Then go through EVERY category, naming each one, and treat each by where it sits: an area in a healthy, low band, appreciate warmly as a real strength; an area in a middle band, reassure them they are managing it and holding it together for now; an area in a high or critical band, show genuine alarm, name it plainly as where things are breaking down, and say this is exactly where they most need help. Keep each to a sentence or two so it flows naturally, not a list.`,
      `Most people, whatever their profession, are quietly missing a sense of purpose, so wherever their meaning, fulfilment, or inner stability is in a high or critical band, hit that hard and name it directly, that the spark and the sense of why have faded, and that this is the deepest cost of all.`,
      `Also make the overall weight clear, matching their band: if CRITICAL, say plainly this is an alarming situation and, if they truly meant their answers, they may be at the edge of a possible crash needing immediate action because the cost can become irreversible; if HIGH or Unstable, say they are struggling to keep things together and perhaps few people are really there for them, maybe they never asked or asked and did not get the help they needed, which makes it heavier; if MEDIUM or Overwhelmed, name that it is getting overwhelming at times and now is the moment to act; if LOW or Stable, keep it light and affirming.`,
      `CRISIS CARE applies ONLY when the overall band is the highest (CRITICAL) AND the overall percentage is 90 or above; for every other band, or below 90 percent, skip this entirely and do not output the token below. When it applies, immediately BEFORE your closing call to action add a brief, warm, non-clinical line of 1 to 2 sentences in the same compassionate voice, VARIED every time and never a canned disclaimer, gently saying that if things feel genuinely unbearable right now, reaching out for immediate human support matters more than any video or call (for tone only, never copy: "and one honest thing first, if right now it feels like more than you can hold, please do not sit with it alone tonight"; or "if what you are carrying has started to feel unbearable in this moment, please pause here, today needs a hand first"). Immediately after that line, on its own line, output exactly this token and nothing else: {{CRISIS_LINE}} . Do NOT write any phone number or helpline yourself, the token is replaced automatically.`,
      `THEN give the solution and hope, and use their first name AGAIN here so it feels personal. Tell them their purpose is not gone, it is right there waiting, they simply need someone to show them where, and the moment they see it they will feel a completely different energy. Then tell them you have been exactly where they are and came out of it, and that the training video below is exactly how you did it and how they can too, so it is well worth their full attention.`,
      `These are inferences from a short, self-reported assessment, so hedge the specifics with words like maybe, perhaps, it may be, rather than flat accusations, while still being clear and direct about the overall band.`,
      `VARY your opening and phrasing for every person. Do NOT start the same way each time, and NEVER reuse stock lines like "you are carrying a lot" or "give yourself credit". Keep it realistic, specific, and grounded in their profession and their actual strong and weak areas.`,
      `Use short, clear, plain sentences that a 12 year old could read. No jargon, no bullet points, no headings, and sound like a real, caring human, not an AI.`,
      `Do NOT use em dashes or en dashes. Use commas, the word and, or full stops.`,
      `Write about ${w.min} to ${w.max} words.`,
      `Output only the message text, with no preamble, no quotes around it, and nothing after it.`,
    ].join(" "),
};

/** Order = display order in the dashboard. First entry is the default. */
export const PROMPT_VERSIONS: PromptVersion[] = [v2EasyRead, v1Mentor];
export const DEFAULT_PROMPT_VERSION = v2EasyRead.id;

/**
 * The system prompt for a tenant instruction version is the owner's text,
 * VERBATIM. No scaffold, no word count, no crisis block, no "use the band words"
 * line — nothing that could contradict what they wrote. The only thing the app
 * adds (in prompt.ts) is the prompt-injection safety guard, which never changes
 * the message. The score/category DATA is supplied in the user message, so the
 * instructions stay purely about how to interpret and write.
 */
export function assembleSystemFromInstructions(
  instructions: string,
  _input: StatementInput,
  _w: { min: number; max: number },
): string {
  return instructions.trim();
}

/** Wrap a stored instruction row as a PromptVersion. `minimal` tells prompt.ts to
 *  add only the safety guard, so the owner's instructions reach the model intact. */
export function instructionVersion(row: {
  id: string;
  label: string;
  instructions: string;
}): PromptVersion {
  return {
    id: row.id,
    label: row.label,
    description: "Custom instructions.",
    minimal: true,
    buildSystem: (input, w) => assembleSystemFromInstructions(row.instructions, input, w),
  };
}

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
  profession: "Business Owner",
  assessmentTitle: "Executive Emotional Stability Assessment",
  scoreRaw: 52,
  max: 60,
  percentage: 77,
  band: "Critical",
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
      score: 2,
      max: 12,
      band: "Emotionally Present",
      questions: [
        { text: "Are you fully present with the people closest to you?", answer: "Usually", score: 1, max: 4 },
        { text: "Do those close to you get the best of you or what is left?", answer: "The best of me", score: 0, max: 4 },
        { text: "How connected do you feel to loved ones lately?", answer: "Very connected", score: 1, max: 4 },
      ],
    },
    {
      name: "Meaning, Fulfilment & Inner Stability",
      score: 11,
      max: 12,
      band: "Needs immediate attention, else life feels hollow",
      questions: [
        { text: "Does your success still feel meaningful?", answer: "Less and less", score: 4, max: 4 },
        { text: "How often do you feel you are going through the motions?", answer: "Very often", score: 4, max: 4 },
        { text: "Do you remember why you started?", answer: "It is fading", score: 3, max: 4 },
      ],
    },
  ],
  guidance: null,
};

/** A hand-quality reference (the framed example shown in the dashboard) in the
 *  current voice: open on the strongest area, name EVERY category by severity,
 *  hit the missing purpose hard, then the purpose-hope + been-there bridge. */
export const SAMPLE_EASY_READ = `Swannik, you are clearly good at staying close to the people who matter, because as a business owner your relationships and presence are well managed, and that is a real strength many in your position lose first.

Your emotional control and leadership you are holding together for now, managing it even under real pressure, and that counts. But your inner pressure and mental burden is where things are breaking down, your mind barely switches off and the weight rarely lifts, and that is alarming. Your emotional cost of success is climbing too, the wins are starting to feel hollow. And the deepest one, your meaning and inner stability has gone quiet, the spark and the sense of why have faded, and most people never name that, but it is the heaviest cost of all. Overall this sits in the critical range, and if you truly meant your answers, you may be closer to a crash than you let yourself believe, so it needs honest action now.

Here is the real truth though, Swannik, your purpose is not gone, it is right there waiting, you simply need someone to show you where, and the moment you see it you will feel a completely different energy. I have been exactly where you are and came out of it, and the training video below is exactly how I did it, so please give it your full attention.`;
