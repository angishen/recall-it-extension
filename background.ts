import { storageService } from "./lib/storage";
import { updateSM2, defaultSM2State } from "./lib/sm2";
import type {
  ExtensionMessage,
  GenerateQuizMessage,
  EvaluateAnswerMessage,
  UpdateSM2Message,
  Quiz,
  Question,
  RawQuestion,
  SM2Quality,
} from "./lib/types";

// Set this to your deployed Cloudflare Worker URL.
// During local development you can run `wrangler dev` and use http://localhost:8787
const PROXY_URL = "https://recall-it-proxy.recallit.workers.dev";

const log = (...args: unknown[]) => console.log("[background]", ...args);
const err = (...args: unknown[]) => console.error("[background]", ...args);

// ─── Badge ────────────────────────────────────────────────────────────────────

async function refreshBadge(): Promise<void> {
  const count = await storageService.getDueCount();
  log("badge refreshed — due count:", count);
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#4F46E5" });
}

// ─── Side panel on action click ───────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(() => { log("onStartup"); refreshBadge(); });
chrome.runtime.onInstalled.addListener((details) => { log("onInstalled", details.reason); refreshBadge(); });

// ─── Proxy helper ─────────────────────────────────────────────────────────────

async function callProxy(task: string, payload: Record<string, unknown>): Promise<unknown> {
  log(`callProxy → ${task}`);
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload }),
  });

  log(`callProxy ← ${task} status=${response.status}`);

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText })) as { error: string };
    err(`callProxy error:`, errBody);
    throw new Error(errBody.error ?? `Proxy error ${response.status}`);
  }

  return response.json();
}

// ─── Quiz generation ──────────────────────────────────────────────────────────

async function handleGenerateQuiz(
  msg: GenerateQuizMessage,
  sendResponse: (r: unknown) => void
): Promise<void> {
  log("handleGenerateQuiz", { type: msg.quizType, count: msg.count, difficulty: msg.difficulty });
  try {
    const rawQuestions = await callProxy("generate_quiz", {
      content: msg.content,
      type: msg.quizType,
      count: msg.count,
      difficulty: msg.difficulty,
      topicHint: msg.topicHint,
    }) as RawQuestion[];

    log(`generated ${rawQuestions.length} raw questions`);

    const now = new Date().toISOString();
    const quizId = crypto.randomUUID();

    const questions: Question[] = rawQuestions.map((raw) => ({
      ...raw,
      id: crypto.randomUUID(),
      quizId,
      ...defaultSM2State(),
    }));

    // Derive source URL and domain from the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sourceUrl = tab?.url ?? "";
    const sourceDomain = sourceUrl ? new URL(sourceUrl).hostname : "";

    const quiz: Quiz = {
      id: quizId,
      title: tab?.title ?? "Untitled Quiz",
      sourceUrl,
      sourceDomain,
      createdAt: now,
      updatedAt: now,
      tags: [],
      questionIds: questions.map((q) => q.id),
      quizType: msg.quizType,
      difficulty: msg.difficulty,
    };

    log("saving quiz", { quizId, title: quiz.title, questionCount: questions.length });
    await storageService.saveQuiz(quiz, questions);
    await refreshBadge();

    sendResponse({ type: "QUIZ_GENERATED", quiz, questions });
    log("QUIZ_GENERATED response sent");
  } catch (e) {
    err("handleGenerateQuiz failed:", e);
    sendResponse({
      type: "QUIZ_GENERATED",
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
}

// ─── Short answer evaluation ──────────────────────────────────────────────────

async function handleEvaluateAnswer(
  msg: EvaluateAnswerMessage,
  sendResponse: (r: unknown) => void
): Promise<void> {
  log("handleEvaluateAnswer — questionId:", msg.question.id);
  try {
    const result = await callProxy("evaluate_answer", {
      prompt: msg.question.prompt,
      answer: msg.question.answer,
      sourceText: msg.question.sourceText,
      userResponse: msg.userResponse,
    }) as { verdict: string; feedback: string; modelAnswer: string };

    log("evaluation verdict:", result.verdict);
    sendResponse({
      type: "ANSWER_EVALUATED",
      verdict: result.verdict,
      feedback: result.feedback,
      modelAnswer: result.modelAnswer,
    });
  } catch (e) {
    err("handleEvaluateAnswer failed:", e);
    sendResponse({
      type: "ANSWER_EVALUATED",
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
}

// ─── SM-2 update ──────────────────────────────────────────────────────────────

async function handleUpdateSM2(
  msg: UpdateSM2Message,
  sendResponse: (r: unknown) => void
): Promise<void> {
  log("handleUpdateSM2 — questionId:", msg.questionId, "quality:", msg.quality);
  try {
    const { questions } = await storageService.getAll();
    const question = questions[msg.questionId];
    if (!question) throw new Error(`Question ${msg.questionId} not found`);

    const sm2Update = updateSM2(question, msg.quality as SM2Quality);
    log("SM-2 result — interval:", sm2Update.interval, "nextReview:", sm2Update.nextReviewDate, "easeFactor:", sm2Update.easeFactor.toFixed(2));
    await storageService.updateQuestion(msg.questionId, sm2Update);
    await refreshBadge();

    sendResponse({ type: "SM2_UPDATED" });
  } catch (e) {
    err("handleUpdateSM2 failed:", e);
    sendResponse({
      type: "SM2_UPDATED",
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    log("message received:", message.type);
    switch (message.type) {
      case "GENERATE_QUIZ":
        handleGenerateQuiz(message, sendResponse);
        return true; // keep channel open for async response

      case "EVALUATE_ANSWER":
        handleEvaluateAnswer(message, sendResponse);
        return true;

      case "UPDATE_SM2":
        handleUpdateSM2(message, sendResponse);
        return true;

      case "GET_DUE_COUNT":
        storageService.getDueCount().then((count) => {
          sendResponse({ type: "DUE_COUNT", count });
        });
        return true;

      default:
        return false;
    }
  }
);

export {};
