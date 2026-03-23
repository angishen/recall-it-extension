import React, { useState } from "react";
import type { Quiz, Question, SM2Quality, ShortAnswerVerdict } from "../../lib/types";
import { verdictToQuality } from "../../lib/sm2";

interface Props {
  quiz: Quiz;
  questions: Question[];
  onComplete: (results: { question: Question; quality: SM2Quality }[]) => void;
  onExit: () => void;
}

type Phase = "question" | "feedback" | "rate";

const QUALITY_BUTTONS: { quality: SM2Quality; label: string; color: string }[] = [
  { quality: 1, label: "Again",  color: "bg-red-100 text-red-700 hover:bg-red-200" },
  { quality: 2, label: "Hard",   color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
  { quality: 3, label: "Good",   color: "bg-green-100 text-green-700 hover:bg-green-200" },
  { quality: 4, label: "Easy",   color: "bg-brand-100 text-brand-700 hover:bg-brand-200" },
];

export function QuizView({ quiz, questions, onComplete, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("question");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [shortInput, setShortInput] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    verdict: ShortAnswerVerdict;
    feedback: string;
    modelAnswer: string;
  } | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [results, setResults] = useState<{ question: Question; quality: SM2Quality }[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);

  const question = questions[index];
  const isLast = index === questions.length - 1;

  function advanceOrFinish(quality: SM2Quality) {
    // Send SM-2 update to background
    chrome.runtime.sendMessage({ type: "UPDATE_SM2", questionId: question.id, quality });

    const newResults = [...results, { question, quality }];

    if (isLast) {
      onComplete(newResults);
    } else {
      setResults(newResults);
      setIndex(index + 1);
      setPhase("question");
      setSelectedOption(null);
      setShortInput("");
      setFlipped(false);
      setEvaluation(null);
      setEvalError(null);
    }
  }

  // ── Multiple choice ──────────────────────────────────────────────────────────
  function handleOptionSelect(option: string) {
    if (phase !== "question") return;
    setSelectedOption(option);
    setPhase("rate");
  }

  // ── Short answer ─────────────────────────────────────────────────────────────
  async function handleShortAnswerSubmit() {
    if (!shortInput.trim()) return;
    setEvaluating(true);
    setEvalError(null);

    const result = await new Promise<{
      verdict: ShortAnswerVerdict;
      feedback: string;
      modelAnswer: string;
      error?: string;
    }>((resolve) =>
      chrome.runtime.sendMessage(
        { type: "EVALUATE_ANSWER", question, userResponse: shortInput.trim() },
        resolve
      )
    );

    setEvaluating(false);

    if (result.error) {
      setEvalError(result.error);
      return;
    }

    setEvaluation(result);
    setPhase("feedback");
  }

  // ── Flashcard (cloze) ─────────────────────────────────────────────────────────
  function handleFlipOrReveal() {
    setFlipped(true);
    setPhase("rate");
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderQuestion() {
    if (question.type === "multiple_choice") {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800">{question.prompt}</p>
          <div className="space-y-1">
            {question.options?.map((opt) => {
              const isCorrect = opt === question.answer;
              const isSelected = opt === selectedOption;
              let cls = "w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ";
              if (phase === "rate") {
                if (isCorrect) cls += "border-green-400 bg-green-50 text-green-800";
                else if (isSelected && !isCorrect) cls += "border-red-400 bg-red-50 text-red-700";
                else cls += "border-gray-200 bg-white text-gray-500";
              } else {
                cls += "border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50";
              }
              return (
                <button key={opt} className={cls} onClick={() => handleOptionSelect(opt)}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (question.type === "short_answer") {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800">{question.prompt}</p>
          {phase === "question" && (
            <>
              <textarea
                value={shortInput}
                onChange={(e) => setShortInput(e.target.value)}
                rows={3}
                placeholder="Type your answer…"
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 resize-none"
              />
              {evalError && (
                <p className="text-xs text-red-600">{evalError}</p>
              )}
              <button
                onClick={handleShortAnswerSubmit}
                disabled={evaluating || !shortInput.trim()}
                className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {evaluating ? "Grading…" : "Submit"}
              </button>
            </>
          )}
          {phase === "feedback" && evaluation && (
            <div className="space-y-2">
              <div
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  evaluation.verdict === "pass"
                    ? "bg-green-50 text-green-800"
                    : evaluation.verdict === "partial"
                    ? "bg-orange-50 text-orange-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {evaluation.verdict === "pass" ? "✓ Correct" : evaluation.verdict === "partial" ? "~ Partially correct" : "✗ Incorrect"}
              </div>
              <p className="text-xs text-gray-600">{evaluation.feedback}</p>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <p className="text-[10px] text-gray-400 mb-0.5">Model answer</p>
                <p className="text-xs text-gray-700">{evaluation.modelAnswer}</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Flashcard / cloze
    const displayPrompt = flipped
      ? question.prompt.replace("___", `[${question.answer}]`)
      : question.prompt;

    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-800 font-mono">{displayPrompt}</p>
        {!flipped && (
          <button
            onClick={handleFlipOrReveal}
            className="w-full rounded-lg border border-brand-600 text-brand-600 py-2 text-xs font-semibold hover:bg-brand-50"
          >
            Reveal Answer
          </button>
        )}
        {flipped && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            <span className="font-medium">{question.answer}</span>
          </div>
        )}
      </div>
    );
  }

  function renderRatingBar() {
    // For short answer, auto-rate based on verdict; show the auto-assigned rating
    if (question.type === "short_answer" && evaluation) {
      const autoQuality = verdictToQuality(evaluation.verdict);
      return (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400">Auto-rated based on your response</p>
          <button
            onClick={() => advanceOrFinish(autoQuality)}
            className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Next →
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <p className="text-[10px] text-gray-400">How well did you know this?</p>
        <div className="grid grid-cols-4 gap-1">
          {QUALITY_BUTTONS.map(({ quality, label, color }) => (
            <button
              key={quality}
              onClick={() => advanceOrFinish(quality)}
              className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px] text-gray-400">
          <span className="truncate max-w-[60%]">{quiz.title}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span>{index + 1} / {questions.length}</span>
            <button
              onClick={() => setConfirmExit(true)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Exit quiz"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="h-1 rounded-full bg-gray-200">
          <div
            className="h-1 rounded-full bg-brand-600 transition-all"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Exit confirmation */}
      {confirmExit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
          <p className="text-xs text-amber-800">Exit quiz? Progress so far won't be saved.</p>
          <div className="flex gap-2">
            <button
              onClick={onExit}
              className="flex-1 rounded bg-red-500 py-1 text-xs font-medium text-white hover:bg-red-600"
            >
              Exit
            </button>
            <button
              onClick={() => setConfirmExit(false)}
              className="flex-1 rounded border border-gray-200 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Keep going
            </button>
          </div>
        </div>
      )}

      {/* Question content */}
      <div className="flex-1">
        {renderQuestion()}
      </div>

      {/* Rating bar — shown after answering */}
      {phase === "rate" && renderRatingBar()}
      {phase === "feedback" && question.type === "short_answer" && renderRatingBar()}
    </div>
  );
}
