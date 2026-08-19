function timeOfDay(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Activity-feed timestamp: relative inside the last hour ("10 mins ago"),
 * then day-anchored with a clock time ("Today, 11:00 AM" / "Yesterday, 4:32 PM"),
 * then an explicit date.
 *
 * Deliberately separate from formatRelativeTime, which stays purely
 * relative ("6h ago", "3d ago") — that's the right read for a dense table
 * column, but on a scannable activity feed "Today, 11:00 AM" tells you
 * something "6h ago" doesn't.
 */
export function formatActivityTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? "1 min ago" : `${diffMin} mins ago`;

  if (isSameDay(date, now)) return `Today, ${timeOfDay(date)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Yesterday, ${timeOfDay(date)}`;

  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  return `${datePart}, ${timeOfDay(date)}`;
}
