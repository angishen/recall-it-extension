# Technical Design Document: Recall It

---

## 1. Overview

This document describes the technical design for v1 of the Recall It Chrome Extension. It covers system architecture, component breakdown, data models, API contracts, and key algorithms. The v2 cloud/dashboard layer is noted where relevant but not fully specified here.

---

## 2. System Architecture

### 2.1 Component Map

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome Browser                         │
│                                                         │
│  ┌──────────────┐      ┌──────────────────────────────┐ │
│  │  Content     │      │        Side Panel UI         │ │
│  │  Script      │◄────►│  (React app, sidepanel.html) │ │
│  │              │      └──────────────┬───────────────┘ │
│  └──────────────┘                     │ chrome.runtime  │
│                                       ▼                 │
│                          ┌────────────────────────┐     │
│                          │    Background Service  │     │
│                          │       Worker           │     │
│                          │  - API proxy calls     │     │
│                          │  - SM-2 scheduling     │     │
│                          │  - Storage management  │     │
│                          │  - Badge updates       │     │
│                          └────────────┬───────────┘     │
│                                       │                 │
│                          ┌────────────▼───────────┐     │
│                          │   chrome.storage.local │     │
│                          └────────────────────────┘     │
└───────────────────────────────┬─────────────────────────┘
                                │ HTTPS
                                ▼
                   ┌────────────────────────┐
                   │   Backend API Proxy    │
                   │  (Cloudflare Worker)   │
                   └────────────┬───────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │     Claude API         │
                   │   (Anthropic)          │
                   └────────────────────────┘
```

### 2.2 Extension Components

| Component | File | Responsibility |
|---|---|---|
| Manifest | `manifest.json` | Declares permissions, side panel, service worker, content scripts |
| Side Panel | `sidepanel/` | React app — all quiz UI, library, review sessions |
| Background Service Worker | `background.js` | Orchestrates API calls, SM-2 updates, badge, storage writes |
| Content Script | `content.js` | Extracts page text, reads user text selection, injected into active tab |

### 2.3 Permissions Required

```json
{
  "permissions": ["storage", "activeTab", "scripting", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" }
}
```

---

## 3. Data Models

All data is stored in `chrome.storage.local` as JSON. The top-level keys are `quizzes`, `collections`, and `settings`.

### 3.1 Question

```typescript
interface Question {
  id: string;                        // uuid
  quizId: string;
  type: "multiple_choice" | "short_answer" | "flashcard";
  prompt: string;                    // The question text or cloze sentence with "___"
  answer: string;                    // Correct answer or blanked term
  options?: string[];                // Multiple choice only — 4 items, answer is one of them
  sourceText: string;                // The original sentence/passage this was derived from

  // SM-2 state
  easeFactor: number;                // Default: 2.5
  interval: number;                  // Days until next review. Default: 1
  repetitions: number;               // Number of times reviewed with rating >= 3
  nextReviewDate: string;            // ISO date string
  lastReviewedDate: string | null;
  correctCount: number;
  incorrectCount: number;
}
```

### 3.2 Quiz

```typescript
interface Quiz {
  id: string;                        // uuid
  title: string;                     // Auto-set to page title; user can rename
  sourceUrl: string;
  sourceDomain: string;              // Extracted from sourceUrl for filtering
  createdAt: string;                 // ISO datetime
  updatedAt: string;
  tags: string[];
  questionIds: string[];
  quizType: "multiple_choice" | "short_answer" | "flashcard" | "mixed";
  difficulty: "basic" | "intermediate" | "challenging";
}
```

### 3.3 Collection

```typescript
interface Collection {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  quizIds: string[];                 // Ordered list of constituent quiz IDs
  tags: string[];
}
```

### 3.4 Storage Schema

```typescript
interface StorageRoot {
  quizzes: Record<string, Quiz>;
  questions: Record<string, Question>;
  collections: Record<string, Collection>;
  settings: {
    defaultQuizType: "multiple_choice" | "short_answer" | "flashcard";
    defaultQuestionCount: number;
    defaultDifficulty: "basic" | "intermediate" | "challenging";
  };
}
```

> **Note:** `chrome.storage.local` has a 10 MB default quota. Each question is ~1–2 KB. This supports ~5,000–10,000 questions before hitting limits — sufficient for v1. Quota warnings should be surfaced in the UI.

---

## 4. Content Extraction

### 4.1 Content Script Flow

1. On message from side panel (`GET_PAGE_CONTENT`), the content script:
   - Checks `window.getSelection()` — if non-empty, returns the selected text only
   - Otherwise, clones `document.body`, removes `<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`, `<noscript>`, elements with `role="navigation"`, `role="banner"`, `role="complementary"`, and common ad class patterns (`[class*="ad-"]`, `[id*="sidebar"]`, etc.)
   - Returns `innerText` of the cleaned clone along with `document.title` and `location.href`

### 4.2 TF-IDF Chunking for Long Pages

If extracted text exceeds **12,000 tokens** (estimated at ~48,000 characters), it is chunked and sampled before sending to the AI:

```
1. Split text into overlapping chunks of ~1,500 tokens with 100-token overlap
2. Build a term frequency map across all chunks
3. Score each chunk: sum of TF-IDF scores for its top-20 terms
   - TF(term, chunk) = count(term in chunk) / total terms in chunk
   - IDF(term) = log(total chunks / chunks containing term)
4. Rank chunks by score, select top N chunks that fit within 12,000 tokens
5. Re-order selected chunks by their original position (preserve reading order)
6. Join with a separator and send to AI
```

This is implemented in the background service worker so it runs off the main thread.

---

## 5. AI Integration

### 5.1 Backend Proxy

A lightweight Cloudflare Worker sits between the extension and the Claude API. Its sole purpose is to hold the API key server-side and forward requests.

**Endpoint:** `POST /generate`

**Request:**
```json
{
  "task": "generate_quiz" | "evaluate_answer",
  "payload": { ... }
}
```

**Response:** Streams Claude's response back to the extension.

The worker enforces a simple rate limit (e.g., 20 requests/minute per IP) to prevent abuse. In v2, this is replaced by per-user rate limiting tied to auth tokens.

### 5.2 Quiz Generation Prompt

The background worker constructs a structured prompt and calls `claude-sonnet-4-6` with `max_tokens` set per quiz type.

**System prompt:**
```
You are a quiz generation assistant. Given a passage of text, generate quiz questions
that test comprehension of the most important facts, concepts, and relationships in the text.
Return only valid JSON matching the schema provided. Do not include any other text.
```

**User prompt structure:**
```
Generate {count} {type} questions at {difficulty} difficulty from the following text.
{optional: Focus on: {topicHint}}

TEXT:
{extractedContent}

Return a JSON array of question objects matching this schema:
{schema}
```

**Schemas by type:**

```jsonc
// Multiple choice
{
  "prompt": "string",
  "answer": "string",
  "options": ["string", "string", "string", "string"],
  "sourceText": "string"
}

// Short answer
{
  "prompt": "string",
  "answer": "string",
  "sourceText": "string"
}

// Flashcard (cloze)
{
  "prompt": "string",   // Full sentence with ___ in place of the key term
  "answer": "string",   // The blanked term
  "sourceText": "string"
}
```

### 5.3 Short Answer Evaluation Prompt

Called immediately after the user submits a short answer response.

**System prompt:**
```
You are a grading assistant. Evaluate whether the user's answer correctly addresses
the question based on the reference answer and source text. Be lenient on phrasing
but strict on factual accuracy. Return only valid JSON.
```

**User prompt:**
```
Question: {prompt}
Reference answer: {answer}
Source text: {sourceText}
User's response: {userResponse}

Return JSON:
{
  "verdict": "pass" | "partial" | "fail",
  "feedback": "string (1-2 sentences explaining what was right/wrong)",
  "modelAnswer": "string"
}
```

**Verdict → SM-2 rating mapping:**
| Verdict | SM-2 Quality |
|---|---|
| pass | 4 (Easy) |
| partial | 2 (Hard) |
| fail | 1 (Again) |

---

## 6. SM-2 Spaced Repetition Engine

Implemented as a pure function module in the background service worker.

### 6.1 Algorithm

```typescript
interface ReviewResult {
  quality: 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
}

function updateSM2(question: Question, quality: ReviewResult["quality"]): Partial<Question> {
  let { easeFactor, interval, repetitions } = question;

  if (quality < 3) {
    // Failed — reset repetition count, review again soon
    repetitions = 0;
    interval = 1;
  } else {
    // Passed — advance interval
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (clamped to minimum 1.3)
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (4 - quality) * (0.08 + (4 - quality) * 0.02));

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    easeFactor,
    interval,
    repetitions,
    nextReviewDate: nextReviewDate.toISOString().split("T")[0],
    lastReviewedDate: new Date().toISOString(),
    correctCount: quality >= 3 ? question.correctCount + 1 : question.correctCount,
    incorrectCount: quality < 3 ? question.incorrectCount + 1 : question.incorrectCount,
  };
}
```

### 6.2 Badge Update

After every session and on extension startup, the background worker counts questions where `nextReviewDate <= today` and sets the badge:

```typescript
chrome.action.setBadgeText({ text: dueCount > 0 ? String(dueCount) : "" });
chrome.action.setBadgeBackgroundColor({ color: "#4F46E5" });
```

---

## 7. Side Panel UI

### 7.1 Views / Routes

The side panel is a single-page React app using in-memory routing (no URL router needed).

| View | Description |
|---|---|
| `Generate` | Default view when opening from a page — quiz type selector, settings, generate button, content preview |
| `Quiz` | Active quiz session — question by question, confidence rating after each |
| `Review` | Spaced repetition review session — pulls all due questions across quizzes |
| `Result` | Post-session summary — score, questions to retry, next review dates |
| `Library` | List of all saved quizzes and collections with search/filter |
| `QuizDetail` | Individual quiz view — question list, study or re-quiz options |
| `CollectionDetail` | Collection view — constituent quizzes, unified study option |

### 7.2 Offline State

On mount, the side panel checks connectivity via `navigator.onLine` and listens to `window` `online`/`offline` events.

- **Offline:** The `Generate` view disables the generate button and shows a banner: "No internet connection — quiz generation is unavailable. You can still review saved quizzes."
- **Review, Library, QuizDetail, CollectionDetail:** Fully functional offline.

### 7.3 State Management

Local React state + `chrome.storage.local` accessed through a thin storage service. No external state library in v1.

```
storageService.ts
  getAll(): Promise<StorageRoot>
  saveQuiz(quiz, questions): Promise<void>
  updateQuestion(questionId, patch): Promise<void>
  getQuestionsDueToday(): Promise<Question[]>
  deleteQuiz(quizId): Promise<void>
  createCollection(title, quizIds): Promise<void>
```

---

## 8. Project File Structure

```
recall-it-extension/
├── manifest.json
├── background.js               # Service worker entry point
├── content.js                  # Content script (page text extraction)
├── sidepanel/
│   ├── index.html
│   ├── index.tsx               # React entry
│   ├── App.tsx                 # Router / top-level view switcher
│   ├── views/
│   │   ├── Generate.tsx
│   │   ├── Quiz.tsx
│   │   ├── Review.tsx
│   │   ├── Result.tsx
│   │   ├── Library.tsx
│   │   ├── QuizDetail.tsx
│   │   └── CollectionDetail.tsx
│   ├── components/             # Shared UI components
│   └── hooks/                  # useStorage, useOnlineStatus, etc.
├── lib/
│   ├── sm2.ts                  # Pure SM-2 algorithm
│   ├── tfidf.ts                # Chunking and relevance sampling
│   ├── storage.ts              # chrome.storage.local service
│   ├── promptBuilder.ts        # Builds AI prompts for each quiz type
│   └── types.ts                # Shared TypeScript interfaces
├── proxy/                      # Cloudflare Worker (separate deploy)
│   └── worker.ts
└── package.json
```

---

## 9. Message Passing

Communication between the content script, side panel, and background service worker uses `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.

| Message | From | To | Payload |
|---|---|---|---|
| `GET_PAGE_CONTENT` | Side Panel | Content Script | `{}` |
| `PAGE_CONTENT_RESPONSE` | Content Script | Side Panel | `{ text, title, url }` |
| `GENERATE_QUIZ` | Side Panel | Background | `{ content, type, count, difficulty, topicHint }` |
| `QUIZ_GENERATED` | Background | Side Panel | `{ questions }` |
| `EVALUATE_ANSWER` | Side Panel | Background | `{ question, userResponse }` |
| `ANSWER_EVALUATED` | Background | Side Panel | `{ verdict, feedback, modelAnswer }` |
| `UPDATE_SM2` | Side Panel | Background | `{ questionId, quality }` |
| `GET_DUE_COUNT` | Side Panel | Background | `{}` |
| `DUE_COUNT` | Background | Side Panel | `{ count }` |

---

## 10. Error Handling

| Scenario | Behavior |
|---|---|
| Claude API returns error / times out | Show inline error in side panel with retry button; do not save partial quiz |
| Content script fails to extract text | Show "Could not read this page" with option to paste text manually |
| `chrome.storage.local` quota exceeded | Show warning banner in Library: "Storage is nearly full — consider deleting old quizzes" |
| User goes offline mid-generation | Cancel request, show offline banner, offer to resume when back online |
| AI returns malformed JSON | Retry once with a stricter prompt; if still malformed, show error |

---

## 11. v2 Considerations

The following are not implemented in v1 but the data model and architecture are designed to support them without breaking changes:

- **Auth:** Add a `userId` field to all models; sync via REST API
- **Cloud sync:** The `storageService` abstraction can be swapped for a hybrid local + remote implementation
- **Dashboard:** All quiz/question data is already structured for a relational DB mapping (`Quiz` → `Question[]`, `Collection` → `Quiz[]`)
- **Anki export:** The `Question` model maps directly to Anki's note format; cloze cards are natively compatible
