export type MovementStatus =
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

const TONE_CLASSES: Record<MovementStatus["kind"], string> = {
  success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  error: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function MovementStatusBanner({ status }: { status: MovementStatus | null }) {
  if (!status) return null;

  return (
    <div role="status" className={`rounded-lg px-3 py-2.5 text-sm font-medium ${TONE_CLASSES[status.kind]}`}>
      {status.message}
    </div>
  );
}
