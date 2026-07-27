const STORAGE_KEY = "alia-noori:lastWorkspace";

/**
 * Last brand workspace the user visited — used only to auto-redirect "/" to
 * it (see hooks/useLastWorkspaceCode.ts for the read side). Never used to
 * scope data access; the [brand] URL segment is the only thing that does.
 */
export function setLastWorkspaceCode(code: string): void {
  window.localStorage.setItem(STORAGE_KEY, code.toLowerCase());
}
