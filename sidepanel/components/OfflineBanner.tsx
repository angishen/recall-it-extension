import React from "react";

export function OfflineBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
      <span>⚠</span>
      <span>No internet — quiz generation unavailable. Reviews still work.</span>
    </div>
  );
}
