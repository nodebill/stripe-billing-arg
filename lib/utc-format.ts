const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const utcDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(value: number | Date) {
  return typeof value === "number" ? new Date(value * 1000) : value;
}

export function formatUtcDate(value: number | Date) {
  return utcDateFormatter.format(toDate(value));
}

export function formatUtcDateTime(value: number | Date) {
  return `${utcDateTimeFormatter.format(toDate(value))} UTC`;
}

export function formatUtcDateRange(
  start: number | Date,
  end: number | Date
) {
  return `${formatUtcDate(start)} to ${formatUtcDate(end)}`;
}
