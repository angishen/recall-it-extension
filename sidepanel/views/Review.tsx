import React, { useEffect, useState } from "react";
import { storageService } from "../../lib/storage";
import type { Question, SM2Quality } from "../../lib/types";
import { QuizView } from "./Quiz";
import type { Quiz } from "../../lib/types";

interface Props {
  onComplete: (results: { question: Question; quality: SM2Quality }[]) => void;
  onExit: () => void;
}

export function ReviewView({ onComplete, onExit }: Props) {
  const [dueQuestions, setDueQuestions] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storageService.getQuestionsDueToday().then((qs) => {
      setDueQuestions(qs);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        Loading due items…
      </div>
    );
  }

  if (!dueQuestions || dueQuestions.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-semibold text-gray-700">All caught up!</p>
        <p className="text-xs text-gray-400">No items due for review today. Come back tomorrow.</p>
      </div>
    );
  }

  // Build a synthetic quiz shell for the review session
  const reviewQuiz: Quiz = {
    id: "review-session",
    title: "Review Session",
    sourceUrl: "",
    sourceDomain: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    questionIds: dueQuestions.map((q) => q.id),
    quizType: "mixed",
    difficulty: "intermediate",
  };

  return (
    <QuizView
      quiz={reviewQuiz}
      questions={dueQuestions}
      onComplete={onComplete}
      onExit={onExit}
    />
  );
}
