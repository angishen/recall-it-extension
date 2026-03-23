import React, { useState, useEffect } from "react";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { OfflineBanner } from "./components/OfflineBanner";
import { NavBar } from "./components/NavBar";
import { GenerateView } from "./views/Generate";
import { QuizView } from "./views/Quiz";
import { ReviewView } from "./views/Review";
import { ResultView } from "./views/Result";
import { LibraryView } from "./views/Library";
import { QuizDetailView } from "./views/QuizDetail";
import { CollectionDetailView } from "./views/CollectionDetail";
import type { Quiz, Question, Collection, SM2Quality } from "../lib/types";

export type View =
  | "generate"
  | "quiz"
  | "review"
  | "result"
  | "library"
  | "quiz-detail"
  | "collection-detail";

export interface NavState {
  // quiz session
  activeQuiz?: Quiz;
  activeQuestions?: Question[];
  // result
  sessionResults?: { question: Question; quality: SM2Quality }[];
  // detail views
  selectedQuizId?: string;
  selectedCollectionId?: string;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [view, setView] = useState<View>("generate");
  const [navState, setNavState] = useState<NavState>({});
  const [dueCount, setDueCount] = useState(0);

  // Fetch due count on mount and when returning to top-level views
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_DUE_COUNT" }, (res) => {
      if (res?.count !== undefined) setDueCount(res.count);
    });
  }, [view]);

  function navigate(v: View, state: NavState = {}) {
    setNavState(state);
    setView(v);
  }

  const topLevel = view === "generate" || view === "library" || view === "review";

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-sm overflow-hidden">
      {!isOnline && <OfflineBanner />}

      {topLevel && (
        <NavBar current={view as "generate" | "library" | "review"} dueCount={dueCount} onNavigate={(v) => navigate(v)} />
      )}

      <div className="flex-1 overflow-y-auto">
        {view === "generate" && (
          <GenerateView isOnline={isOnline} onStartQuiz={(quiz, questions) =>
            navigate("quiz", { activeQuiz: quiz, activeQuestions: questions })
          } />
        )}
        {view === "quiz" && navState.activeQuiz && navState.activeQuestions && (
          <QuizView
            quiz={navState.activeQuiz}
            questions={navState.activeQuestions}
            onComplete={(results) => navigate("result", { sessionResults: results })}
            onExit={() => navigate("generate")}
          />
        )}
        {view === "review" && (
          <ReviewView
            onComplete={(results) => navigate("result", { sessionResults: results })}
            onExit={() => navigate("generate")}
          />
        )}
        {view === "result" && navState.sessionResults && (
          <ResultView
            results={navState.sessionResults}
            onDone={() => navigate("generate")}
            onGoToLibrary={() => navigate("library")}
          />
        )}
        {view === "library" && (
          <LibraryView
            onSelectQuiz={(id) => navigate("quiz-detail", { selectedQuizId: id })}
            onSelectCollection={(id) => navigate("collection-detail", { selectedCollectionId: id })}
          />
        )}
        {view === "quiz-detail" && navState.selectedQuizId && (
          <QuizDetailView
            quizId={navState.selectedQuizId}
            onBack={() => navigate("library")}
            onStartQuiz={(quiz, questions) =>
              navigate("quiz", { activeQuiz: quiz, activeQuestions: questions })
            }
          />
        )}
        {view === "collection-detail" && navState.selectedCollectionId && (
          <CollectionDetailView
            collectionId={navState.selectedCollectionId}
            onBack={() => navigate("library")}
            onStartQuiz={(quiz, questions) =>
              navigate("quiz", { activeQuiz: quiz, activeQuestions: questions })
            }
          />
        )}
      </div>
    </div>
  );
}
