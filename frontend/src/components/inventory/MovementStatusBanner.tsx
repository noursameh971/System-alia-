export type MovementStatus = { kind: "success"; message: string } | { kind: "error"; message: string };

export function MovementStatusBanner({ status }: { status: MovementStatus | null }) {
  if (!status) return null;

  const isSuccess = status.kind === "success";
  return (
    <div
      role="status"
      className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
        isSuccess
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {status.message}
    </div>
  );
}
