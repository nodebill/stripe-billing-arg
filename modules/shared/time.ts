export type RecurringInterval = "month" | "year";

export function toUnix(date: Date | null): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

export function addRecurringInterval(date: Date, interval: RecurringInterval) {
  const next = new Date(date);

  if (interval === "month") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}
