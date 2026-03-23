import React from "react";
import type { Question, SM2Quality } from "../../lib/types";

interface Props {
  results: { question: Question; quality: SM2Quality }[];
  onDone: () => void;
  onGoToLibrary: () => void;
}

const QUALITY_LABEL: Record<SM2Quality, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

export function ResultView({ results, onDone, onGoToLibrary }: Props) {
  const pass    = results.filter((r) => r.quality >= 3).length;
  const fail    = results.filter((r) => r.quality < 3).length;
  const total   = results.length;
  const pct     = Math.round((pass / total) * 100);

  const missed  = results.filter((r) => r.quality < 3);

  return (
    <div className="p-4 space-y-4">
      {/* Score summary */}
      <div className="rounded-xl bg-white border border-gray-200 p-4 text-center space-y-1">
        <p className="text-3xl font-bold text-brand-600">{pct}%</p>
        <p className="text-xs text-gray-500">{pass} correct · {fail} missed · {total} total</p>
      </div>

      {/* Missed questions */}
      {missed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Review these again
          </h2>
          {missed.map(({ question, quality }) => (
            <div
              key={question.id}
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 space-y-1"
            >
              <p className="text-xs font-medium text-gray-800">{question.prompt}</p>
              <p className="text-xs text-gray-500">
                Answer: <span className="font-medium text-gray-700">{question.answer}</span>
              </p>
              <p className="text-[10px] text-red-500">{QUALITY_LABEL[quality]}</p>
            </div>
          ))}
        </div>
      )}

      {missed.length === 0 && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center text-xs text-green-700 font-medium">
          Perfect session! All items answered correctly.
        </div>
      )}

      {/* Next review info */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
        Items have been scheduled for spaced repetition review. Check the Review tab tomorrow.
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onGoToLibrary}
          className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Library
        </button>
        <button
          onClick={onDone}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          New Quiz
        </button>
      </div>
    </div>
  );
}
