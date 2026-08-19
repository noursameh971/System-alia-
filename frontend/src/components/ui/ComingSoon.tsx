import { EmptyState } from "./EmptyState";

export function ComingSoon({ page }: { page: string }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">{page}</h1>
      <EmptyState
        title={`${page} is coming in a future step`}
        description="The backend APIs for this already exist — this page just hasn't been wired up yet."
      />
    </div>
  );
}
