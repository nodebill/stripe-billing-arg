import type { Price } from "@/modules/prices/types";

export function formatPriceAmount(
  unitAmount: number,
  currency: string,
  locale = "en-US"
) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(unitAmount / 100);
  } catch {
    return `${unitAmount} ${currency.toUpperCase()}`;
  }
}

export function formatPriceType(price: Price) {
  if (price.type === "one_time") return "One-time";
  return price.recurring?.interval === "year" ? "Yearly" : "Monthly";
}
