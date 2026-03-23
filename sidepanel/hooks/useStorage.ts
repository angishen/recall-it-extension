import { useState, useEffect, useCallback } from "react";
import { storageService } from "../../lib/storage";
import type { StorageRoot } from "../../lib/types";

export function useStorage() {
  const [data, setData] = useState<StorageRoot | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const root = await storageService.getAll();
    setData(root);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();

    // Re-sync whenever storage changes (e.g. background worker writes)
    const listener = () => reload();
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [reload]);

  return { data, loading, reload };
}
