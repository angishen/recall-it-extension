// TF-IDF based chunking and relevance sampling for long pages.
// Splits text into overlapping chunks and selects the most information-dense
// ones up to a token budget.

const CHUNK_SIZE_CHARS = 6000;   // ~1,500 tokens at ~4 chars/token
const OVERLAP_CHARS = 400;       // ~100 tokens
const MAX_CHARS = 48000;         // ~12,000 tokens — Claude context budget
const TOP_TERMS_PER_CHUNK = 20;

// Simple whitespace tokenizer — strips punctuation, lowercases
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

// Common English stop words to exclude from TF-IDF scoring
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "that", "this", "from", "they", "will",
  "would", "could", "should", "been", "being", "also", "its",
  "their", "there", "than", "then", "when", "what", "which", "who",
  "how", "all", "any", "each", "one", "two", "can", "may", "more",
  "into", "over", "after", "before", "about", "some", "such", "other",
]);

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    if (!STOP_WORDS.has(token)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  // Normalize by chunk length
  for (const [term, count] of freq) {
    freq.set(term, count / tokens.length);
  }
  return freq;
}

interface Chunk {
  text: string;
  index: number;   // Original position for re-ordering
  score: number;
}

/**
 * If the text fits within MAX_CHARS, returns it as-is.
 * Otherwise chunks, scores each chunk by TF-IDF relevance, and returns
 * the most information-dense subset that fits in MAX_CHARS, re-ordered
 * by original position.
 */
export function sampleRelevantContent(text: string): string {
  if (text.length <= MAX_CHARS) return text;

  // 1. Split into overlapping chunks
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < text.length) {
    const chunkText = text.slice(i, i + CHUNK_SIZE_CHARS);
    chunks.push({ text: chunkText, index: chunks.length, score: 0 });
    i += CHUNK_SIZE_CHARS - OVERLAP_CHARS;
  }

  // 2. Build IDF: count how many chunks contain each term
  const chunkTokens = chunks.map((c) => tokenize(c.text));
  const documentFreq = new Map<string, number>();
  for (const tokens of chunkTokens) {
    const unique = new Set(tokens);
    for (const term of unique) {
      documentFreq.set(term, (documentFreq.get(term) ?? 0) + 1);
    }
  }

  const numChunks = chunks.length;
  const idf = (term: string): number =>
    Math.log(numChunks / (1 + (documentFreq.get(term) ?? 0)));

  // 3. Score each chunk using TF-IDF sum of top terms
  for (let j = 0; j < chunks.length; j++) {
    const tf = termFrequency(chunkTokens[j]);
    const tfidfScores = Array.from(tf.entries())
      .map(([term, tfScore]) => tfScore * idf(term))
      .sort((a, b) => b - a)
      .slice(0, TOP_TERMS_PER_CHUNK);
    chunks[j].score = tfidfScores.reduce((sum, s) => sum + s, 0);
  }

  // 4. Select highest-scoring chunks within budget
  const sorted = [...chunks].sort((a, b) => b.score - a.score);
  const selected: Chunk[] = [];
  let totalChars = 0;
  for (const chunk of sorted) {
    if (totalChars + chunk.text.length > MAX_CHARS) break;
    selected.push(chunk);
    totalChars += chunk.text.length;
  }

  // 5. Re-order by original position and join
  selected.sort((a, b) => a.index - b.index);
  return selected.map((c) => c.text).join("\n\n[...]\n\n");
}
