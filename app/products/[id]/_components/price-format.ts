import type { Price } from "@/modules/prices/types";

function shiftMinorUnitsToMajorUnits(value: string, scale = 2) {
  const [wholePart, fractionPart = ""] = value.split(".");
  const digits = `${wholePart}${fractionPart}`.replace(/^0+(?=\d)/, "") || "0";
  const sourceScale = fractionPart.length;
  const targetScale = sourceScale + scale;
  const padded = digits.padStart(targetScale + 1, "0");
  const whole = padded.slice(0, -targetScale) || "0";
  const fraction = padded.slice(-targetScale).replace(/0+$/, "");

  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

export function formatPriceAmount(
  unitAmountDecimal: string,
  currency: string,
  locale = "en-US"
) {
  const majorUnits = shiftMinorUnitsToMajorUnits(unitAmountDecimal);
  const fractionDigits = majorUnits.includes(".")
    ? Math.max(2, majorUnits.split(".")[1]!.length)
    : 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number(majorUnits));
  } catch {
    return `${majorUnits} ${currency.toUpperCase()}`;
  }
}

export function formatPriceType(price: Price) {
  if (price.type === "one_time") return "One-time";
  const interval = price.recurring?.interval === "year" ? "Yearly" : "Monthly";
  return price.recurring?.usage_type === "metered"
    ? `${interval} metered`
    : interval;
}
