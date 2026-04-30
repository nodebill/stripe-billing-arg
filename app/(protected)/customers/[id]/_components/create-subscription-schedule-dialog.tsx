"use client";

import { useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Price } from "@/modules/prices/types";
import type { Subscription } from "@/modules/subscriptions/types";
import { formatUtcDateTime } from "@/lib/utc-format";

type SchedulePriceOption = {
  id: string;
  label: string;
  interval: "month" | "year";
  usageType: "licensed" | "metered";
  currency: string;
  meter: string | null;
};

function toUtcDateTimeInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toUtcUnix(value: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 1000);
}

export function CreateSubscriptionScheduleDialog({
  subscription,
  currentPrice,
  priceOptions,
  onCreated,
}: {
  subscription: Subscription;
  currentPrice: Price;
  priceOptions: SchedulePriceOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"permanent" | "temporary">("temporary");
  const [selectedPriceId, setSelectedPriceId] = useState(priceOptions[0]?.id ?? "");
  const [effectiveAt, setEffectiveAt] = useState(() =>
    toUtcDateTimeInputValue(new Date())
  );
  const [revertAt, setRevertAt] = useState(() =>
    toUtcDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  );
  const [error, setError] = useState<string | null>(null);

  const currentPeriodEndUnix = subscription.current_period_end;
  const currentPeriodEndLabel = useMemo(
    () => formatUtcDateTime(currentPeriodEndUnix),
    [currentPeriodEndUnix]
  );

  const triggerDisabled = priceOptions.length === 0;

  async function handleSubmit() {
    if (!selectedPriceId) {
      setError("Select a replacement price");
      return;
    }

    const effectiveAtUnix = toUtcUnix(effectiveAt);
    if (!Number.isFinite(effectiveAtUnix)) {
      setError("Choose a valid effective date");
      return;
    }

    if (effectiveAtUnix >= currentPeriodEndUnix) {
      setError("The effective date must stay within the current billing period");
      return;
    }

    const phases =
      mode === "temporary"
        ? [
            {
              price: selectedPriceId,
              start_date: effectiveAtUnix,
              end_date: toUtcUnix(revertAt),
            },
            {
              price: currentPrice.id,
              start_date: toUtcUnix(revertAt),
              end_date: currentPeriodEndUnix,
            },
          ]
        : [
            {
              price: selectedPriceId,
              start_date: effectiveAtUnix,
              end_date: currentPeriodEndUnix,
            },
          ];

    if (mode === "temporary") {
      const revertAtUnix = toUtcUnix(revertAt);
      if (!Number.isFinite(revertAtUnix)) {
        setError("Choose a valid revert date");
        return;
      }

      if (revertAtUnix <= effectiveAtUnix) {
        setError("The revert date must be after the effective date");
        return;
      }

      if (revertAtUnix > currentPeriodEndUnix) {
        setError("The revert date must stay within the current billing period");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/subscription_schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.id,
        end_behavior: "release",
        phases,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to create subscription schedule");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-xs" disabled={triggerDisabled} />}
      >
        <Clock3 />
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Schedule a price change</DialogTitle>
          <DialogDescription>
            Create a mid-cycle price change for {subscription.id}. The final
            phase persists after this billing period ends.
          </DialogDescription>
        </DialogHeader>

        {triggerDisabled ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            No compatible replacement prices are available for this subscription.
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`schedule-price-${subscription.id}`}>Replacement price</Label>
              <select
                id={`schedule-price-${subscription.id}`}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={selectedPriceId}
                onChange={(event) => setSelectedPriceId(event.target.value)}
              >
                {priceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`schedule-mode-${subscription.id}`}>Change type</Label>
              <select
                id={`schedule-mode-${subscription.id}`}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "permanent" | "temporary")
                }
              >
                <option value="temporary">Temporary discount</option>
                <option value="permanent">Permanent change</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`schedule-effective-${subscription.id}`}>Effective at (UTC)</Label>
              <Input
                id={`schedule-effective-${subscription.id}`}
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
              />
            </div>

            {mode === "temporary" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`schedule-revert-${subscription.id}`}>Revert at (UTC)</Label>
                <Input
                  id={`schedule-revert-${subscription.id}`}
                  type="datetime-local"
                  value={revertAt}
                  onChange={(event) => setRevertAt(event.target.value)}
                />
              </div>
            ) : null}

            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              The schedule will release at the end of the current billing period on{" "}
              {currentPeriodEndLabel}.
            </div>
            <p className="text-xs text-muted-foreground">
              All times in this form are interpreted in UTC.
            </p>
          </div>
        )}

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={loading || triggerDisabled} onClick={handleSubmit}>
            {loading ? "Saving..." : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
