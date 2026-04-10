export type RecurringInterval = "month" | "year";

export function toUnix(date: Date | null): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

export function fromUtcDateString(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toUtcDateExclusiveEnd(value: string) {
  const date = fromUtcDateString(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildClampedUtcDate(
  year: number,
  monthIndex: number,
  dayOfMonth: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
) {
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(dayOfMonth, daysInUtcMonth(year, monthIndex)),
      hour,
      minute,
      second,
      millisecond
    )
  );
}

export function addRecurringInterval(date: Date, interval: RecurringInterval) {
  const next = new Date(date);
  const dayOfMonth = next.getUTCDate();
  const hour = next.getUTCHours();
  const minute = next.getUTCMinutes();
  const second = next.getUTCSeconds();
  const millisecond = next.getUTCMilliseconds();

  if (interval === "month") {
    const nextMonthIndex = next.getUTCMonth() + 1;
    const nextYear = next.getUTCFullYear() + Math.floor(nextMonthIndex / 12);
    const normalizedMonthIndex = ((nextMonthIndex % 12) + 12) % 12;
    return buildClampedUtcDate(
      nextYear,
      normalizedMonthIndex,
      dayOfMonth,
      hour,
      minute,
      second,
      millisecond
    );
  }

  return buildClampedUtcDate(
    next.getUTCFullYear() + 1,
    next.getUTCMonth(),
    dayOfMonth,
    hour,
    minute,
    second,
    millisecond
  );
}

export function resolveBillingCycleAnchorConfig(
  now: Date,
  interval: RecurringInterval,
  config: {
    day_of_month: number;
    month?: number;
    hour?: number;
    minute?: number;
    second?: number;
  }
) {
  const hour = config.hour ?? now.getUTCHours();
  const minute = config.minute ?? now.getUTCMinutes();
  const second = config.second ?? now.getUTCSeconds();
  const millisecond = now.getUTCMilliseconds();

  if (interval === "month") {
    let year = now.getUTCFullYear();
    let monthIndex = now.getUTCMonth();
    let candidate = buildClampedUtcDate(
      year,
      monthIndex,
      config.day_of_month,
      hour,
      minute,
      second,
      millisecond
    );

    if (candidate.getTime() <= now.getTime()) {
      monthIndex += 1;
      year += Math.floor(monthIndex / 12);
      monthIndex %= 12;
      candidate = buildClampedUtcDate(
        year,
        monthIndex,
        config.day_of_month,
        hour,
        minute,
        second,
        millisecond
      );
    }

    return candidate;
  }

  const monthIndex = (config.month ?? now.getUTCMonth() + 1) - 1;
  let year = now.getUTCFullYear();
  let candidate = buildClampedUtcDate(
    year,
    monthIndex,
    config.day_of_month,
    hour,
    minute,
    second,
    millisecond
  );

  if (candidate.getTime() <= now.getTime()) {
    year += 1;
    candidate = buildClampedUtcDate(
      year,
      monthIndex,
      config.day_of_month,
      hour,
      minute,
      second,
      millisecond
    );
  }

  return candidate;
}
