const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

export const MAX_FIXED_DECIMAL_SCALE = 12;

export type FixedDecimal = {
  mantissa: bigint;
  scale: number;
};

function pow10(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

export function parseFixedDecimal(
  value: string,
  maxScale = MAX_FIXED_DECIMAL_SCALE
): FixedDecimal {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error("Decimal values must contain only digits and an optional decimal point");
  }

  const [wholePart, rawFraction = ""] = value.split(".");
  if (rawFraction.length > maxScale) {
    throw new Error(`Decimal values support up to ${maxScale} fractional digits`);
  }

  const fractionPart = rawFraction.replace(/0+$/, "");
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const mantissaText = `${normalizedWhole}${fractionPart}`;
  const mantissa = BigInt(mantissaText === "" ? "0" : mantissaText);
  const scale = fractionPart.length;

  return { mantissa, scale };
}

export function normalizeFixedDecimal(
  value: string,
  maxScale = MAX_FIXED_DECIMAL_SCALE
): string {
  const parsed = parseFixedDecimal(value, maxScale);
  return fixedDecimalToString(parsed);
}

export function fixedDecimalToString(value: FixedDecimal): string {
  if (value.scale === 0) {
    return value.mantissa.toString();
  }

  const negative = value.mantissa < 0;
  const digits = (negative ? -value.mantissa : value.mantissa).toString();
  const padded = digits.padStart(value.scale + 1, "0");
  const whole = padded.slice(0, -value.scale);
  const fraction = padded.slice(-value.scale).replace(/0+$/, "");
  const result = fraction.length > 0 ? `${whole}.${fraction}` : whole;

  return negative ? `-${result}` : result;
}

export function roundFixedDecimalToInt(value: FixedDecimal): bigint {
  if (value.scale === 0) {
    return value.mantissa;
  }

  const divisor = pow10(value.scale);
  const quotient = value.mantissa / divisor;
  const remainder = value.mantissa % divisor;

  if (remainder === BigInt(0)) {
    return quotient;
  }

  return remainder * BigInt(2) >= divisor ? quotient + BigInt(1) : quotient;
}

export function multiplyIntegerByDecimal(
  multiplier: number,
  decimalValue: string,
  maxScale = MAX_FIXED_DECIMAL_SCALE
): FixedDecimal {
  if (!Number.isInteger(multiplier) || multiplier < 0) {
    throw new Error("Multiplier must be a non-negative integer");
  }

  const parsed = parseFixedDecimal(decimalValue, maxScale);
  return {
    mantissa: BigInt(multiplier) * parsed.mantissa,
    scale: parsed.scale,
  };
}

export function multiplyIntegerByDecimalAndRound(
  multiplier: number,
  decimalValue: string,
  maxScale = MAX_FIXED_DECIMAL_SCALE
): number {
  const rounded = roundFixedDecimalToInt(
    multiplyIntegerByDecimal(multiplier, decimalValue, maxScale)
  );

  if (
    rounded > BigInt(Number.MAX_SAFE_INTEGER) ||
    rounded < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Rounded decimal amount exceeds the supported integer range");
  }

  return Number(rounded);
}

export function multiplyDecimalByFractionAndRound(
  decimalValue: string,
  numerator: bigint,
  denominator: bigint,
  maxScale = MAX_FIXED_DECIMAL_SCALE
): number {
  if (numerator < BigInt(0)) {
    throw new Error("Numerator must be non-negative");
  }

  if (denominator <= BigInt(0)) {
    throw new Error("Denominator must be greater than zero");
  }

  const parsed = parseFixedDecimal(decimalValue, maxScale);
  const dividend = parsed.mantissa * numerator;
  const divisor = denominator * pow10(parsed.scale);
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  const rounded =
    remainder === BigInt(0) || remainder * BigInt(2) < divisor
      ? quotient
      : quotient + BigInt(1);

  if (
    rounded > BigInt(Number.MAX_SAFE_INTEGER) ||
    rounded < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Rounded decimal amount exceeds the supported integer range");
  }

  return Number(rounded);
}
