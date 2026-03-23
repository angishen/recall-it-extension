import React, { useEffect, useState } from "react";
import { storageService } from "../../lib/storage";
import type { Quiz, Question } from "../../lib/types";

interface Props {
  quizId: string;
  onBack: () => void;
  onStartQuiz: (quiz: Quiz, questions: Question[]) => void;
}

export function QuizDetailView({ quizId, onBack, onStartQuiz }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const root = await storageService.getAll();
    const q = root.quizzes[quizId];
    if (!q) return;
    setQuiz(q);
    setTitleInput(q.title);
    setQuestions(q.questionIds.map((id) => root.questions[id]).filter(Boolean));
  }

  useEffect(() => { load(); }, [quizId]);

  async function saveTitle() {
    if (!titleInput.trim()) return;
    await storageService.updateQuiz(quizId, { title: titleInput.trim() });
    setEditingTitle(false);
    load();
  }

  async function addTag() {
    if (!tagInput.trim() || !quiz) return;
    const tags = Array.from(new Set([...quiz.tags, tagInput.trim()]));
    await storageService.updateQuiz(quizId, { tags });
    setTagInput("");
    load();
  }

  async function removeTag(tag: string) {
    if (!quiz) return;
    await storageService.updateQuiz(quizId, { tags: quiz.tags.filter((t) => t !== tag) });
    load();
  }

  async function handleDelete() {
    await storageService.deleteQuiz(quizId);
    onBack();
  }

  if (!quiz) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        Loading…
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const dueCount = questions.filter((q) => q.nextReviewDate <= today).length;

  return (
    <div className="p-4 space-y-4">
      {/* Back */}
      <button onClick={onBack} className="text-xs text-brand-600 hover:underline">
        ← Back to Library
      </button>

      {/* Title */}
      {editingTitle ? (
        <div className="flex gap-2">
          <input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button onClick={saveTitle} className="text-xs text-brand-600 font-medium hover:underline">Save</button>
          <button onClick={() => setEditingTitle(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-800">{quiz.title}</h1>
          <button onClick={() => setEditingTitle(true)} className="text-[10px] text-gray-400 hover:text-brand-600">Edit</button>
        </div>
      )}

      {/* Meta */}
      <div className="text-[10px] text-gray-400 space-y-0.5">
        <p>Source: <a href={quiz.sourceUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate">{quiz.sourceDomain || quiz.sourceUrl}</a></p>
        <p>Created: {new Date(quiz.createdAt).toLocaleDateString()}</p>
        <p>{questions.length} questions · {quiz.quizType.replace("_", " ")} · {quiz.difficulty}</p>
        {dueCount > 0 && <p className="text-brand-600 font-medium">{dueCount} due for review</p>}
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-gray-500">Tags</p>
        <div className="flex flex-wrap gap-1">
          {quiz.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-red-500">×</button>
            </span>
          ))}
          <div className="flex gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="Add tag…"
              className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-[10px]"
            />
            {tagInput && (
              <button onClick={addTag} className="text-[10px] text-brand-600">+</button>
            )}
          </div>
        </div>
      </div>

      {/* Question list */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Questions</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
              <p className="text-xs text-gray-700">{i + 1}. {q.prompt}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Next review: {q.nextReviewDate} · {q.correctCount}✓ {q.incorrectCount}✗
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!deleting ? (
          <button
            onClick={() => setDeleting(true)}
            className="flex-1 rounded-lg border border-red-200 text-red-500 py-2 text-xs font-medium hover:bg-red-50"
          >
            Delete
          </button>
        ) : (
          <div className="flex-1 flex gap-1">
            <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-500 text-white py-2 text-xs font-medium">
              Confirm Delete
            </button>
            <button onClick={() => setDeleting(false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-xs text-gray-600">
              Cancel
            </button>
          </div>
        )}
        <button
          onClick={() => onStartQuiz(quiz, questions)}
          className="flex-1 rounded-lg bg-brand-600 text-white py-2 text-xs font-semibold hover:bg-brand-700"
        >
          Study
        </button>
      </div>
    </div>
  );
}
