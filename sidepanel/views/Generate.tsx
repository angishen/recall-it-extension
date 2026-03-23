import React, { useState } from "react";
import { sampleRelevantContent } from "../../lib/tfidf";
import type { Quiz, Question, Difficulty } from "../../lib/types";

interface Props {
  isOnline: boolean;
  onStartQuiz: (quiz: Quiz, questions: Question[]) => void;
}

type QuizType = "multiple_choice" | "short_answer" | "flashcard";

const QUESTION_COUNTS = [3, 5, 10];
const MAX_QUESTIONS = 50;

export function GenerateView({ isOnline, onStartQuiz }: Props) {
  const [quizType, setQuizType] = useState<QuizType>("multiple_choice");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [topicHint, setTopicHint] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getPageContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Could not read the active tab.");

    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
    } catch {
      // Content script not running (e.g. extension just reloaded, tab opened before install).
      // Inject it programmatically and retry once.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" });
    }
  }

  async function loadPreview() {
    try {
      const response = await getPageContent();
      setPreview(sampleRelevantContent(response.text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read page content.");
    }
  }

  async function handleGenerate() {
    setError(null);
    setLoading(true);

    try {
      let content = preview;
      if (!content) {
        const response = await getPageContent();
        content = sampleRelevantContent(response.text);
      }

      const result = await new Promise<{ quiz: Quiz; questions: Question[]; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "GENERATE_QUIZ",
              content,
              quizType,
              count,
              difficulty,
              topicHint: topicHint.trim() || undefined,
            },
            resolve
          );
        }
      );

      if (result.error) throw new Error(result.error);
      onStartQuiz(result.quiz, result.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const quizTypes: { value: QuizType; label: string; desc: string }[] = [
    { value: "multiple_choice", label: "Multiple Choice", desc: "4-option questions" },
    { value: "short_answer",    label: "Short Answer",    desc: "AI-graded responses" },
    { value: "flashcard",       label: "Flashcards",      desc: "Cloze deletion cards" },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-base font-semibold text-gray-800">Generate Quiz</h1>

      {/* Quiz type */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Quiz Type</label>
        <div className="grid grid-cols-3 gap-1">
          {quizTypes.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setQuizType(value)}
              className={`rounded-lg border p-2 text-left transition-colors ${
                quizType === value
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="text-xs font-medium">{label}</div>
              <div className="text-[10px] text-gray-500">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Count + difficulty */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Questions</label>
          <div className="flex gap-1">
            {QUESTION_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex-1 rounded border py-1 text-xs font-medium transition-colors ${
                  count === n
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={MAX_QUESTIONS}
              value={QUESTION_COUNTS.includes(count) ? "" : count}
              placeholder="…"
              onChange={(e) => {
                const v = Math.min(MAX_QUESTIONS, Math.max(1, parseInt(e.target.value) || 1));
                setCount(v);
              }}
              className={`w-10 rounded border py-1 text-center text-xs font-medium transition-colors ${
                !QUESTION_COUNTS.includes(count)
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            />
          </div>
          <p className="text-[10px] text-gray-400">Max {MAX_QUESTIONS}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
          >
            <option value="basic">Basic</option>
            <option value="intermediate">Intermediate</option>
            <option value="challenging">Challenging</option>
          </select>
        </div>
      </div>

      {/* Topic hint */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">
          Topic Focus <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={topicHint}
          onChange={(e) => setTopicHint(e.target.value)}
          placeholder="e.g. focus on the methodology section"
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Content preview toggle */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600">Content Preview</label>
          <button
            onClick={loadPreview}
            className="text-[10px] text-brand-600 hover:underline"
          >
            Load from page
          </button>
        </div>
        {preview && (
          <textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            rows={5}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-600 font-mono resize-none"
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!isOnline || loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Generating…" : "Generate Quiz"}
      </button>

      {!isOnline && (
        <p className="text-center text-xs text-gray-400">
          Go online to generate new quizzes.
        </p>
      )}
    </div>
  );
}
