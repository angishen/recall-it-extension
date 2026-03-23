import type { Question, SM2Quality, ShortAnswerVerdict } from "./types";

export interface SM2Update {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string;   // YYYY-MM-DD
  lastReviewedDate: string; // ISO datetime
  correctCount: number;
  incorrectCount: number;
}

/**
 * Applies the SM-2 algorithm to a question given a recall quality rating.
 * Returns only the fields that changed — merge into the existing question.
 *
 * Quality scale:
 *   1 = Again  (complete blank / wrong)
 *   2 = Hard   (correct but significant difficulty)
 *   3 = Good   (correct with some hesitation)
 *   4 = Easy   (perfect recall)
 */
export function updateSM2(question: Question, quality: SM2Quality): SM2Update {
  let { easeFactor, interval, repetitions } = question;

  if (quality < 3) {
    // Failed — reset streak, review again soon
    repetitions = 0;
    interval = 1;
  } else {
    // Passed — advance interval using SM-2 schedule
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Ease factor update — clamped to minimum 1.3
  easeFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (4 - quality) * (0.08 + (4 - quality) * 0.02)
  );

  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + interval);

  return {
    easeFactor,
    interval,
    repetitions,
    nextReviewDate: next.toISOString().split("T")[0],
    lastReviewedDate: now.toISOString(),
    correctCount: quality >= 3 ? question.correctCount + 1 : question.correctCount,
    incorrectCount: quality < 3 ? question.incorrectCount + 1 : question.incorrectCount,
  };
}

/**
 * Maps a short answer AI verdict to an SM-2 quality rating.
 */
export function verdictToQuality(verdict: ShortAnswerVerdict): SM2Quality {
  switch (verdict) {
    case "pass":    return 4;
    case "partial": return 2;
    case "fail":    return 1;
  }
}

/**
 * Returns default SM-2 state for a newly created question.
 */
export function defaultSM2State(): Pick<
  Question,
  | "easeFactor"
  | "interval"
  | "repetitions"
  | "nextReviewDate"
  | "lastReviewedDate"
  | "correctCount"
  | "incorrectCount"
> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReviewDate: tomorrow.toISOString().split("T")[0],
    lastReviewedDate: null,
    correctCount: 0,
    incorrectCount: 0,
  };
}
