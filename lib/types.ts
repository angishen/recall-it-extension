// ─── Quiz & Question ────────────────────────────────────────────────────────

export type QuizType = "multiple_choice" | "short_answer" | "flashcard" | "mixed";
export type Difficulty = "basic" | "intermediate" | "challenging";
export type SM2Quality = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
export type ShortAnswerVerdict = "pass" | "partial" | "fail";

export interface Question {
  id: string;
  quizId: string;
  type: "multiple_choice" | "short_answer" | "flashcard";
  /** The question text, or cloze sentence with ___ in place of the key term */
  prompt: string;
  /** Correct answer or the blanked cloze term */
  answer: string;
  /** Multiple choice only — 4 options, answer is one of them */
  options?: [string, string, string, string];
  /** Original sentence/passage this question was derived from */
  sourceText: string;

  // SM-2 state
  easeFactor: number;       // Default: 2.5
  interval: number;         // Days until next review. Default: 1
  repetitions: number;      // Times reviewed with quality >= 3
  nextReviewDate: string;   // ISO date string YYYY-MM-DD
  lastReviewedDate: string | null;
  correctCount: number;
  incorrectCount: number;
}

export interface Quiz {
  id: string;
  title: string;
  sourceUrl: string;
  sourceDomain: string;
  createdAt: string;        // ISO datetime
  updatedAt: string;
  tags: string[];
  questionIds: string[];
  quizType: QuizType;
  difficulty: Difficulty;
}

export interface Collection {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  quizIds: string[];
  tags: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

export interface UserSettings {
  defaultQuizType: "multiple_choice" | "short_answer" | "flashcard";
  defaultQuestionCount: number;
  defaultDifficulty: Difficulty;
}

export interface StorageRoot {
  quizzes: Record<string, Quiz>;
  questions: Record<string, Question>;
  collections: Record<string, Collection>;
  settings: UserSettings;
}

// ─── AI API ─────────────────────────────────────────────────────────────────

export interface GenerateQuizRequest {
  task: "generate_quiz";
  payload: {
    content: string;
    type: "multiple_choice" | "short_answer" | "flashcard";
    count: number;
    difficulty: Difficulty;
    topicHint?: string;
  };
}

export interface EvaluateAnswerRequest {
  task: "evaluate_answer";
  payload: {
    prompt: string;
    answer: string;
    sourceText: string;
    userResponse: string;
  };
}

export type ProxyRequest = GenerateQuizRequest | EvaluateAnswerRequest;

export interface EvaluateAnswerResponse {
  verdict: ShortAnswerVerdict;
  feedback: string;
  modelAnswer: string;
}

export type RawQuestion = Omit<
  Question,
  | "id"
  | "quizId"
  | "easeFactor"
  | "interval"
  | "repetitions"
  | "nextReviewDate"
  | "lastReviewedDate"
  | "correctCount"
  | "incorrectCount"
>;

// ─── Messaging ───────────────────────────────────────────────────────────────

export type MessageType =
  | "GET_PAGE_CONTENT"
  | "PAGE_CONTENT_RESPONSE"
  | "GENERATE_QUIZ"
  | "QUIZ_GENERATED"
  | "EVALUATE_ANSWER"
  | "ANSWER_EVALUATED"
  | "UPDATE_SM2"
  | "GET_DUE_COUNT"
  | "DUE_COUNT";

export interface GetPageContentMessage {
  type: "GET_PAGE_CONTENT";
}

export interface PageContentResponseMessage {
  type: "PAGE_CONTENT_RESPONSE";
  text: string;
  title: string;
  url: string;
}

export interface GenerateQuizMessage {
  type: "GENERATE_QUIZ";
  content: string;
  quizType: "multiple_choice" | "short_answer" | "flashcard";
  count: number;
  difficulty: Difficulty;
  topicHint?: string;
}

export interface QuizGeneratedMessage {
  type: "QUIZ_GENERATED";
  quiz: Quiz;
  questions: Question[];
}

export interface EvaluateAnswerMessage {
  type: "EVALUATE_ANSWER";
  question: Question;
  userResponse: string;
}

export interface AnswerEvaluatedMessage {
  type: "ANSWER_EVALUATED";
  verdict: ShortAnswerVerdict;
  feedback: string;
  modelAnswer: string;
}

export interface UpdateSM2Message {
  type: "UPDATE_SM2";
  questionId: string;
  quality: SM2Quality;
}

export interface GetDueCountMessage {
  type: "GET_DUE_COUNT";
}

export interface DueCountMessage {
  type: "DUE_COUNT";
  count: number;
}

export type ExtensionMessage =
  | GetPageContentMessage
  | PageContentResponseMessage
  | GenerateQuizMessage
  | QuizGeneratedMessage
  | EvaluateAnswerMessage
  | AnswerEvaluatedMessage
  | UpdateSM2Message
  | GetDueCountMessage
  | DueCountMessage;
