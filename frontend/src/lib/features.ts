/**
 * Frontend feature switches, read at build time (NEXT_PUBLIC_ vars are
 * inlined by Next.js, so changing one needs a redeploy).
 *
 * ASSISTANT_ENABLED gates every UI entry point to the AI assistant — the
 * floating button, the Ctrl/⌘+K shortcut (AdminAssistant.tsx) and the
 * Settings "Knowledge base" tab. Off unless NEXT_PUBLIC_ASSISTANT_ENABLED is
 * exactly "true": it's hidden from the client for now, while the backend
 * routes, RAG pipeline and tables stay deployed and untouched. Set the var
 * in Vercel (or .env.local) and redeploy to bring it back.
 */
export const ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED?.trim() === "true";
