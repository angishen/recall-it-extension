import React, { useEffect, useState } from "react";
import { storageService } from "../../lib/storage";
import type { Quiz, Question, Collection } from "../../lib/types";

interface Props {
  collectionId: string;
  onBack: () => void;
  onStartQuiz: (quiz: Quiz, questions: Question[]) => void;
}

export function CollectionDetailView({ collectionId, onBack, onStartQuiz }: Props) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const root = await storageService.getAll();
    const col = root.collections[collectionId];
    if (!col) return;
    setCollection(col);

    const qs = col.quizIds.map((id) => root.quizzes[id]).filter(Boolean);
    setQuizzes(qs);

    const questions = qs.flatMap((q) =>
      q.questionIds.map((qid) => root.questions[qid]).filter(Boolean)
    );
    setAllQuestions(questions);
  }

  useEffect(() => { load(); }, [collectionId]);

  async function handleDelete() {
    await storageService.deleteCollection(collectionId);
    onBack();
  }

  function handleStudyAll() {
    if (!collection) return;
    // Build a synthetic quiz shell representing the whole collection
    const syntheticQuiz: Quiz = {
      id: `collection-${collectionId}`,
      title: collection.title,
      sourceUrl: "",
      sourceDomain: "",
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
      tags: collection.tags,
      questionIds: allQuestions.map((q) => q.id),
      quizType: "mixed",
      difficulty: "intermediate",
    };
    onStartQuiz(syntheticQuiz, allQuestions);
  }

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        Loading…
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const dueCount = allQuestions.filter((q) => q.nextReviewDate <= today).length;

  return (
    <div className="p-4 space-y-4">
      {/* Back */}
      <button onClick={onBack} className="text-xs text-brand-600 hover:underline">
        ← Back to Library
      </button>

      <div>
        <h1 className="text-base font-semibold text-gray-800">{collection.title}</h1>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {quizzes.length} quizzes · {allQuestions.length} questions total
          {dueCount > 0 && ` · `}
          {dueCount > 0 && <span className="text-brand-600 font-medium">{dueCount} due</span>}
        </p>
      </div>

      {/* Constituent quizzes */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Quizzes in this collection</p>
        {quizzes.map((q) => {
          const qDue = q.questionIds.filter((id) => {
            const question = allQuestions.find((aq) => aq.id === id);
            return question && question.nextReviewDate <= today;
          }).length;
          return (
            <div key={q.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">{q.title}</p>
                {qDue > 0 && (
                  <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {qDue} due
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400">{q.sourceDomain} · {q.questionIds.length}q</p>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!deleting ? (
          <button
            onClick={() => setDeleting(true)}
            className="flex-1 rounded-lg border border-red-200 text-red-500 py-2 text-xs font-medium hover:bg-red-50"
          >
            Delete Collection
          </button>
        ) : (
          <div className="flex-1 flex gap-1">
            <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-500 text-white py-2 text-xs font-medium">
              Confirm
            </button>
            <button onClick={() => setDeleting(false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-xs text-gray-600">
              Cancel
            </button>
          </div>
        )}
        <button
          onClick={handleStudyAll}
          className="flex-1 rounded-lg bg-brand-600 text-white py-2 text-xs font-semibold hover:bg-brand-700"
        >
          Study All
        </button>
      </div>
    </div>
  );
}
