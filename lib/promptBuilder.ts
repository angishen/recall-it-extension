import type { Difficulty } from "./types";

// ─── Schemas embedded in prompts ─────────────────────────────────────────────

const MC_SCHEMA = `[
  {
    "type": "multiple_choice",
    "prompt": "Question text here?",
    "answer": "The correct option (must be one of the options array)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "sourceText": "The original sentence or passage this was derived from"
  }
]`;

const SA_SCHEMA = `[
  {
    "type": "short_answer",
    "prompt": "Question text here?",
    "answer": "The expected correct answer",
    "sourceText": "The original sentence or passage this was derived from"
  }
]`;

const CLOZE_SCHEMA = `[
  {
    "type": "flashcard",
    "prompt": "The full sentence with ___ in place of the key term.",
    "answer": "the key term that was blanked",
    "sourceText": "The original sentence exactly as it appeared in the text"
  }
]`;

// ─── System prompts ──────────────────────────────────────────────────────────

const GENERATE_SYSTEM = `You are a quiz generation assistant. Given a passage of text, generate quiz questions that test comprehension of the most important facts, concepts, and relationships in the text.
Return ONLY a valid JSON array matching the schema provided. Do not include markdown code fences, explanations, or any other text outside the JSON array.`;

const EVALUATE_SYSTEM = `You are a grading assistant. Evaluate whether the user's answer correctly addresses the question based on the reference answer and source text.
Be lenient on phrasing but strict on factual accuracy.
Return ONLY a valid JSON object. Do not include markdown code fences or any other text outside the JSON object.`;

// ─── Prompt builders ─────────────────────────────────────────────────────────

export function buildGeneratePrompt(params: {
  content: string;
  type: "multiple_choice" | "short_answer" | "flashcard";
  count: number;
  difficulty: Difficulty;
  topicHint?: string;
}): { system: string; user: string } {
  const { content, type, count, difficulty, topicHint } = params;

  const typeLabel = {
    multiple_choice: "multiple choice",
    short_answer: "short answer",
    flashcard: "cloze deletion flashcard",
  }[type];

  const schema = {
    multiple_choice: MC_SCHEMA,
    short_answer: SA_SCHEMA,
    flashcard: CLOZE_SCHEMA,
  }[type];

  const difficultyGuidance = {
    basic: "Focus on main ideas and explicitly stated facts.",
    intermediate: "Include both main ideas and supporting details. Some inference required.",
    challenging: "Focus on nuanced details, implied relationships, and synthesis across the text.",
  }[difficulty];

  const clozeGuidance =
    type === "flashcard"
      ? `\nFor cloze cards: prefer sentences that express a concrete fact, definition, or causal relationship. The blanked term must be specific enough that there is exactly one correct answer. Do not blank common words or transitional phrases.`
      : "";

  const topicLine = topicHint ? `\nFocus on: ${topicHint}` : "";

  const user = `Generate ${count} ${typeLabel} questions at ${difficulty} difficulty from the following text.
${difficultyGuidance}${clozeGuidance}${topicLine}

TEXT:
${content}

Return a JSON array of exactly ${count} question objects matching this schema:
${schema}`;

  return { system: GENERATE_SYSTEM, user };
}

export function buildEvaluatePrompt(params: {
  prompt: string;
  answer: string;
  sourceText: string;
  userResponse: string;
}): { system: string; user: string } {
  const { prompt, answer, sourceText, userResponse } = params;

  const user = `Question: ${prompt}
Reference answer: ${answer}
Source text: ${sourceText}
User's response: ${userResponse}

Return a JSON object:
{
  "verdict": "pass" | "partial" | "fail",
  "feedback": "1-2 sentences explaining what was correct or what was missing",
  "modelAnswer": "A clear, complete model answer"
}`;

  return { system: EVALUATE_SYSTEM, user };
}
