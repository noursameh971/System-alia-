/**
 * The business runs on Cairo time: a calendar-day question ("what did we
 * sell yesterday?") means a Cairo day, not a UTC one — between midnight and
 * 2–3am Cairo time the two disagree on what "today" is.
 */
export const BUSINESS_TIMEZONE = "Africa/Cairo";

/** YYYY-MM-DD for the given instant, in the business timezone. en-CA is used only because it formats dates as YYYY-MM-DD. */
export function businessDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** English weekday name for a YYYY-MM-DD date — gives the model a fixed point for "last Monday" style references. */
export function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
