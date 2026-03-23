import React, { useEffect, useState, useMemo } from "react";
import { storageService } from "../../lib/storage";
import type { Quiz, Collection, StorageRoot } from "../../lib/types";

interface Props {
  onSelectQuiz: (id: string) => void;
  onSelectCollection: (id: string) => void;
}

export function LibraryView({ onSelectQuiz, onSelectCollection }: Props) {
  const [data, setData] = useState<StorageRoot | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [dueByQuiz, setDueByQuiz] = useState<Record<string, number>>({});

  async function load() {
    const root = await storageService.getAll();
    setData(root);

    const { isNearLimit } = await storageService.getStorageUsage();
    setStorageWarning(isNearLimit);

    // Count due questions per quiz
    const today = new Date().toISOString().split("T")[0];
    const counts: Record<string, number> = {};
    for (const q of Object.values(root.questions)) {
      if (q.nextReviewDate <= today) {
        counts[q.quizId] = (counts[q.quizId] ?? 0) + 1;
      }
    }
    setDueByQuiz(counts);
  }

  useEffect(() => { load(); }, []);

  const quizzes = useMemo(() => {
    if (!data) return [];
    return Object.values(data.quizzes)
      .filter((q) => {
        if (filterType !== "all" && q.quizType !== filterType) return false;
        if (search) {
          const needle = search.toLowerCase();
          return (
            q.title.toLowerCase().includes(needle) ||
            q.sourceDomain.toLowerCase().includes(needle) ||
            q.tags.some((t) => t.toLowerCase().includes(needle))
          );
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data, search, filterType]);

  const collections = useMemo(() => {
    if (!data) return [];
    return Object.values(data.collections).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [data]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (!collectionName.trim() || selected.size < 2) return;
    await storageService.createCollection(collectionName.trim(), Array.from(selected));
    setMerging(false);
    setCollectionName("");
    setSelected(new Set());
    load();
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        Loading library…
      </div>
    );
  }

  const QUIZ_TYPE_LABELS: Record<string, string> = {
    all: "All",
    multiple_choice: "MC",
    short_answer: "Short",
    flashcard: "Cards",
  };

  return (
    <div className="p-3 space-y-3">
      {storageWarning && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Storage is nearly full — consider deleting old quizzes.
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search quizzes…"
        className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />

      {/* Filter pills */}
      <div className="flex gap-1">
        {Object.entries(QUIZ_TYPE_LABELS).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterType(val)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
              filterType === val
                ? "border-brand-600 bg-brand-50 text-brand-600"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Merge controls */}
      {selected.size >= 2 && !merging && (
        <button
          onClick={() => setMerging(true)}
          className="w-full rounded-lg border border-brand-600 text-brand-600 py-1.5 text-xs font-medium hover:bg-brand-50"
        >
          Merge {selected.size} quizzes into Collection
        </button>
      )}
      {merging && (
        <div className="flex gap-2">
          <input
            type="text"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Collection name…"
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
          />
          <button
            onClick={handleMerge}
            disabled={!collectionName.trim()}
            className="rounded bg-brand-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => { setMerging(false); setSelected(new Set()); }}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Collections */}
      {collections.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Collections</h2>
          {collections.map((col) => (
            <button
              key={col.id}
              onClick={() => onSelectCollection(col.id)}
              className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-brand-400 transition-colors"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-800">{col.title}</p>
                <span className="text-[10px] text-gray-400">{col.quizIds.length} quizzes</span>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Quizzes */}
      <section className="space-y-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Quizzes {quizzes.length > 0 && `(${quizzes.length})`}
        </h2>
        {quizzes.length === 0 && (
          <p className="text-xs text-gray-400 py-2">No quizzes yet. Generate one from any page.</p>
        )}
        {quizzes.map((quiz) => {
          const due = dueByQuiz[quiz.id] ?? 0;
          const isSelected = selected.has(quiz.id);
          return (
            <div key={quiz.id} className="flex gap-2 items-start">
              {selected.size > 0 || merging ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(quiz.id)}
                  className="mt-2 accent-brand-600"
                />
              ) : null}
              <button
                onClick={() => selected.size > 0 ? toggleSelect(quiz.id) : onSelectQuiz(quiz.id)}
                className={`flex-1 text-left rounded-lg border px-3 py-2 transition-colors ${
                  isSelected
                    ? "border-brand-400 bg-brand-50"
                    : "border-gray-200 bg-white hover:border-brand-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-800 truncate">{quiz.title}</p>
                  {due > 0 && (
                    <span className="ml-1 shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      {due} due
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-0.5 text-[10px] text-gray-400">
                  <span>{quiz.sourceDomain || "unknown source"}</span>
                  <span>·</span>
                  <span>{quiz.questionIds.length}q</span>
                  <span>·</span>
                  <span>{quiz.quizType.replace("_", " ")}</span>
                </div>
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
