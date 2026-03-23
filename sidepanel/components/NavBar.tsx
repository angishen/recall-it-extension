import React from "react";
import type { View } from "../App";

interface NavBarProps {
  current: View;
  dueCount: number;
  onNavigate: (v: View) => void;
}

export function NavBar({ current, dueCount, onNavigate }: NavBarProps) {
  const tabs: { view: View; label: string }[] = [
    { view: "generate", label: "Generate" },
    { view: "library",  label: "Library" },
    { view: "review",   label: `Review${dueCount > 0 ? ` (${dueCount})` : ""}` },
  ];

  return (
    <nav className="flex border-b border-gray-200 bg-white">
      {tabs.map(({ view, label }) => (
        <button
          key={view}
          onClick={() => onNavigate(view)}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            current === view
              ? "border-b-2 border-brand-600 text-brand-600"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
