import type { Quiz, Question, Collection, StorageRoot, UserSettings } from "./types";

const QUOTA_WARNING_BYTES = 8 * 1024 * 1024; // 8 MB

const DEFAULT_SETTINGS: UserSettings = {
  defaultQuizType: "multiple_choice",
  defaultQuestionCount: 5,
  defaultDifficulty: "intermediate",
};

const EMPTY_ROOT: StorageRoot = {
  quizzes: {},
  questions: {},
  collections: {},
  settings: DEFAULT_SETTINGS,
};

// ─── Core read/write helpers ─────────────────────────────────────────────────

async function readRoot(): Promise<StorageRoot> {
  const result = await chrome.storage.local.get(null);
  return {
    quizzes:     result.quizzes     ?? {},
    questions:   result.questions   ?? {},
    collections: result.collections ?? {},
    settings:    result.settings    ?? DEFAULT_SETTINGS,
  };
}

async function writeRoot(patch: Partial<StorageRoot>): Promise<void> {
  await chrome.storage.local.set(patch);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const storageService = {
  async getAll(): Promise<StorageRoot> {
    return readRoot();
  },

  async saveQuiz(quiz: Quiz, questions: Question[]): Promise<void> {
    const root = await readRoot();
    root.quizzes[quiz.id] = quiz;
    for (const q of questions) {
      root.questions[q.id] = q;
    }
    await writeRoot({ quizzes: root.quizzes, questions: root.questions });
  },

  async updateQuestion(questionId: string, patch: Partial<Question>): Promise<void> {
    const root = await readRoot();
    const existing = root.questions[questionId];
    if (!existing) throw new Error(`Question ${questionId} not found`);
    root.questions[questionId] = { ...existing, ...patch };
    await writeRoot({ questions: root.questions });
  },

  async getQuestionsDueToday(): Promise<Question[]> {
    const root = await readRoot();
    const today = new Date().toISOString().split("T")[0];
    return Object.values(root.questions).filter(
      (q) => q.nextReviewDate <= today
    );
  },

  async deleteQuiz(quizId: string): Promise<void> {
    const root = await readRoot();
    const quiz = root.quizzes[quizId];
    if (!quiz) return;

    // Remove associated questions
    for (const qId of quiz.questionIds) {
      delete root.questions[qId];
    }
    delete root.quizzes[quizId];

    // Remove quiz from any collections that reference it
    for (const col of Object.values(root.collections)) {
      col.quizIds = col.quizIds.filter((id) => id !== quizId);
    }

    await writeRoot({
      quizzes: root.quizzes,
      questions: root.questions,
      collections: root.collections,
    });
  },

  async createCollection(title: string, quizIds: string[]): Promise<Collection> {
    const root = await readRoot();
    const now = new Date().toISOString();
    const collection: Collection = {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      quizIds,
      tags: [],
    };
    root.collections[collection.id] = collection;
    await writeRoot({ collections: root.collections });
    return collection;
  },

  async deleteCollection(collectionId: string): Promise<void> {
    const root = await readRoot();
    delete root.collections[collectionId];
    await writeRoot({ collections: root.collections });
  },

  async updateQuiz(quizId: string, patch: Partial<Quiz>): Promise<void> {
    const root = await readRoot();
    const existing = root.quizzes[quizId];
    if (!existing) throw new Error(`Quiz ${quizId} not found`);
    root.quizzes[quizId] = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await writeRoot({ quizzes: root.quizzes });
  },

  async updateSettings(patch: Partial<UserSettings>): Promise<void> {
    const root = await readRoot();
    await writeRoot({ settings: { ...root.settings, ...patch } });
  },

  async getDueCount(): Promise<number> {
    const due = await this.getQuestionsDueToday();
    return due.length;
  },

  /** Returns bytes used / quota. Emits a warning flag if > QUOTA_WARNING_BYTES. */
  async getStorageUsage(): Promise<{ bytesInUse: number; isNearLimit: boolean }> {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    return { bytesInUse, isNearLimit: bytesInUse > QUOTA_WARNING_BYTES };
  },

  async clear(): Promise<void> {
    await chrome.storage.local.set(EMPTY_ROOT);
  },
};
