const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS_GENERATE = 4096;
const MAX_TOKENS_EVALUATE = 512;

// Rate limiting: requests per IP per minute
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// In-memory rate limit map (resets when worker isolate is recycled)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

interface Env {
  ANTHROPIC_API_KEY: string;
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count += 1;
  return true;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip markdown code fences that Claude sometimes adds despite instructions. */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

// ─── Claude API call ──────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text in Claude response");
  return textBlock.text;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Rate limit by IP
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    let body: { task: string; payload: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { task, payload } = body;

    try {
      let result: string;

      if (task === "generate_quiz") {
        const { system, user } = buildGeneratePrompt(payload);
        result = stripCodeFences(await callClaude(env.ANTHROPIC_API_KEY, system, user, MAX_TOKENS_GENERATE));
        JSON.parse(result); // validate before returning
      } else if (task === "evaluate_answer") {
        const { system, user } = buildEvaluatePrompt(payload);
        result = stripCodeFences(await callClaude(env.ANTHROPIC_API_KEY, system, user, MAX_TOKENS_EVALUATE));
        JSON.parse(result);
      } else {
        return new Response(
          JSON.stringify({ error: `Unknown task: ${task}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      return new Response(result, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  },
};

// ─── Prompt builders (inlined to keep worker self-contained) ─────────────────

function buildGeneratePrompt(payload: Record<string, unknown>): { system: string; user: string } {
  const { content, type, count, difficulty, topicHint } = payload as {
    content: string;
    type: string;
    count: number;
    difficulty: string;
    topicHint?: string;
  };

  const system = `You are a quiz generation assistant. Given a passage of text, generate quiz questions that test comprehension of the most important facts, concepts, and relationships in the text.
Return ONLY a valid JSON array matching the schema provided. Do not include markdown code fences, explanations, or any other text outside the JSON array.`;

  const schemas: Record<string, string> = {
    multiple_choice: `[{"type":"multiple_choice","prompt":"string","answer":"string (must be one of options)","options":["A","B","C","D"],"sourceText":"string"}]`,
    short_answer: `[{"type":"short_answer","prompt":"string","answer":"string","sourceText":"string"}]`,
    flashcard: `[{"type":"flashcard","prompt":"Full sentence with ___ replacing the key term.","answer":"the key term","sourceText":"string"}]`,
  };

  const typeLabel: Record<string, string> = {
    multiple_choice: "multiple choice",
    short_answer: "short answer",
    flashcard: "cloze deletion flashcard",
  };

  const difficultyGuidance: Record<string, string> = {
    basic: "Focus on main ideas and explicitly stated facts.",
    intermediate: "Include both main ideas and supporting details. Some inference required.",
    challenging: "Focus on nuanced details, implied relationships, and synthesis across the text.",
  };

  const clozeNote = type === "flashcard"
    ? "\nFor cloze cards: prefer sentences expressing a concrete fact, definition, or causal relationship. The blanked term must have exactly one clear correct answer."
    : "";

  const topicLine = topicHint ? `\nFocus on: ${topicHint}` : "";

  const user = `Generate ${count} ${typeLabel[type] ?? type} questions at ${difficulty} difficulty from the following text.
${difficultyGuidance[difficulty] ?? ""}${clozeNote}${topicLine}

TEXT:
${content}

Return a JSON array of exactly ${count} question objects matching this schema:
${schemas[type] ?? "{}"}`;

  return { system, user };
}

function buildEvaluatePrompt(payload: Record<string, unknown>): { system: string; user: string } {
  const { prompt, answer, sourceText, userResponse } = payload as {
    prompt: string;
    answer: string;
    sourceText: string;
    userResponse: string;
  };

  const system = `You are a grading assistant. Evaluate whether the user's answer correctly addresses the question based on the reference answer and source text.
Be lenient on phrasing but strict on factual accuracy.
Return ONLY a valid JSON object with keys: verdict ("pass"|"partial"|"fail"), feedback (string), modelAnswer (string).`;

  const user = `Question: ${prompt}
Reference answer: ${answer}
Source text: ${sourceText}
User's response: ${userResponse}`;

  return { system, user };
}
