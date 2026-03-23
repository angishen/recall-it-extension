# Product Requirements Document: Recall It — Web Content Quiz Extension

---

## 1. Overview

**Product Name:** Recall It
**Type:** Chrome Browser Extension + Web Dashboard
**Goal:** Help users retain information from web pages they read by generating quizzes, flashcards, and tracking long-term comprehension through spaced repetition.

---

## 2. Problem Statement

Users read large amounts of content online but retain very little of it. There's no frictionless way to convert passive reading into active learning. Existing tools require manual effort to create study materials and don't adapt to what the user actually needs to review.

---

## 3. Target Users

- Students doing research and reading academic content
- Professionals keeping up with industry news or documentation
- Lifelong learners reading long-form articles, essays, or reports

---

## 4. Core Features

### 4.1 Quiz Generation (Extension)

**Trigger:** User clicks the extension icon on any web page, which opens a side panel. The user selects a quiz type and initiates generation.

**Quiz Types:**
- **Multiple Choice** — AI generates 4-option questions from page content; one correct answer
- **Short Answer** — AI generates open-ended questions; user types a response; AI auto-evaluates correctness and provides brief feedback
- **Flashcards** — AI extracts key sentences from the page and generates cloze deletion cards, blanking out the most important word or phrase in each

**Content Extraction:**
- Extract visible body text from the active tab (strip nav, ads, boilerplate)
- User may optionally highlight a portion of text to narrow the quiz scope
- If no highlight is selected and the page content exceeds the AI context limit, the content is chunked and the most information-dense sections are selected using a TF-IDF-style relevance pass before sending to the AI
- Show a preview of extracted content before generating

**Generation Settings:**
- Number of questions/cards (3 / 5 / 10 / custom)
- Difficulty level (basic, intermediate, challenging)
- Topic focus (optional free-text hint, e.g. "focus on the methodology section")

#### 4.1.1 Flashcard Extraction Approach

Flashcards use **cloze deletion** exclusively. The AI identifies key sentences from the page content and blanks out the most semantically important word or phrase in each sentence.

**Example:** "The SM-2 algorithm adjusts the \_\_\_\_\_ based on the user's recall quality rating."

The AI should prefer sentences that express a concrete fact, definition, or causal relationship — not transitional or structural sentences. The blanked term should be specific enough that there is one clear correct answer.

---

### 4.2 Short Answer Evaluation

After the user submits a short answer response, a second AI call evaluates the response against the source content and expected answer. The evaluation returns:

- **Pass / Partial / Fail** verdict
- A brief explanation of what was correct or missing
- The model answer for reference

The verdict feeds directly into the spaced repetition scheduler (Pass = high confidence, Partial = medium, Fail = low).

---

### 4.3 Spaced Repetition Engine

**Algorithm:** SM-2 — each card/question has an ease factor and next-review interval that adapts based on user performance.

**Per-question state tracked:**
- Last reviewed date
- Next scheduled review date
- Historical correct/incorrect counts
- Ease factor

**Confidence rating:**
- After each question (or per flashcard flip), the user rates recall quality on a 1–4 scale: Again / Hard / Good / Easy
- For short answers, the AI verdict maps to this scale automatically
- The SM-2 engine updates the next review date and ease factor accordingly

**Extension badge:** Shows count of items due for review today.

**Consolidated review sessions:**
- User can launch a "Review Due" session that surfaces questions from any saved quiz that are due today, across all topics

---

### 4.4 Quiz Persistence & Management

**Local-first storage:**
- All quiz data is stored locally using `chrome.storage.local` in v1
- No account or login required to use the extension
- A future release will add cloud sync and an authenticated web dashboard (see section 7)

**Saving:**
- Every generated quiz is auto-saved with source URL, page title, and date
- User can rename and tag quizzes manually

**Combining quizzes:**
- User can select multiple saved quizzes and merge them into a **Collection** (e.g., "ML Reading List", "Q2 Research")
- Collections can be studied as a unified quiz or reviewed via spaced repetition as a single pool

**Organization (side panel library view):**
- List of all saved quizzes and collections
- Filter by tag, source domain, date, quiz type
- Search by title or question content

---

### 4.5 Web Dashboard (v2)

The dashboard is deferred to a future release. When built, it will be a standalone web app linked to the same account as the extension.

**Dashboard views:**
- **Home:** Items due for review today, recent activity, streak counter
- **Library:** All quizzes and collections (mirrors extension management)
- **Analytics:** Retention rate per topic, question-level heatmap (strong/weak areas), review history over time
- **Review:** Full spaced repetition review session in the browser

**Account & Sync:**
- User creates an account (email/password or Google OAuth)
- All quiz data syncs between extension and dashboard
- Extension works offline; syncs when connection resumes

---

## 5. User Flows

### Flow A: Generate a quiz from a page
1. User reads an article → clicks extension icon → side panel opens
2. Selects quiz type and settings → clicks "Generate"
3. AI processes page content (chunked and sampled if too long) → quiz appears in the side panel
4. User completes quiz → rates confidence per question (or AI rates short answers automatically)
5. Quiz is auto-saved; next review dates are scheduled

### Flow B: Review due items
1. User opens extension → side panel shows "12 items due today"
2. Clicks "Start Review" → mixed question pool from all sources
3. Completes session → SM-2 updates each item's schedule

### Flow C: Build a collection
1. User goes to Library tab in the side panel → selects multiple saved quizzes → clicks "Merge into Collection"
2. Names the collection (e.g., "Transformer Architecture Deep Dive")
3. Collection appears as a single study unit alongside individual quizzes

---

## 6. Technical Architecture (High Level)

| Layer | Technology (proposed) |
|---|---|
| Extension UI | Chrome Extension Manifest V3, Chrome Side Panel API, React + Tailwind |
| Local storage | `chrome.storage.local` |
| AI Quiz Generation | Claude API (Anthropic) via backend proxy |
| Short answer evaluation | Second Claude API call per submission |
| Backend API (v1) | Lightweight proxy to protect API keys (Node.js / Express or Cloudflare Worker) |
| Database (v2) | PostgreSQL (quizzes, questions, user progress) |
| Auth (v2) | Supabase Auth or Clerk |
| Sync (v2) | REST; offline queue in `chrome.storage.local` |
| Dashboard (v2) | Next.js + React |
| Hosting (v2) | Vercel (frontend) + Railway or Supabase (backend/DB) |

---

## 7. Phased Roadmap

### v1 — Local Extension (current scope)
- Side panel UI
- All three quiz types with AI generation
- Short answer auto-evaluation
- Spaced repetition engine (SM-2, local)
- Quiz and collection management (local storage)
- Graceful offline state: generation is disabled with a clear message; review sessions on locally cached quizzes remain fully functional

### v2 — Cloud + Dashboard
- User accounts and authentication
- Cloud sync across devices
- Web dashboard with analytics
- Streak tracking and retention heatmaps

### v3 — Extended Content Sources
- PDF ingestion
- YouTube video transcripts
- Import/export (Anki-compatible format)
- Social/collaborative collections

---

## 8. Open Questions

No unresolved questions — all decisions have been made. See section 7 for phased roadmap.
