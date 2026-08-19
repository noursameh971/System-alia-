import { useSyncExternalStore } from "react";

const STORAGE_KEY = "alia-noori:lastWorkspace";

// Same useSyncExternalStore pattern the old BrandContext used for its
// persisted selection: reading localStorage during render (even gated by
// typeof window) mismatches between the server render and the client's
// first hydration pass. useSyncExternalStore's getServerSnapshot sidesteps
// that by returning null for both the server render and the client's
// hydration-matching pass, then re-rendering with the real value right
// after hydration commits — no synchronous setState-in-effect needed.
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

export function useLastWorkspaceCode(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
