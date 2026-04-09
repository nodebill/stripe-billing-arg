import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUtcDate,
  formatUtcDateRange,
  formatUtcDateTime,
} from "../lib/utc-format";

test("formatUtcDate renders Unix seconds in UTC", () => {
  assert.equal(formatUtcDate(1774915200), "Mar 31, 2026");
});

test("formatUtcDateTime renders UTC suffix", () => {
  assert.equal(formatUtcDateTime(1775149980), "Apr 2, 2026, 17:13 UTC");
});

test("formatUtcDateRange uses UTC on both ends", () => {
  assert.equal(
    formatUtcDateRange(1774958400, 1775044800),
    "Mar 31, 2026 to Apr 1, 2026"
  );
});
