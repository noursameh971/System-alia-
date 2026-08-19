/** "2h ago"-style label for recent timestamps, falling back to a short date for anything over a week old. Pair with a `title` attribute for the exact timestamp. */
export function formatRelativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
