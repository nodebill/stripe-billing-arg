"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatUtcDateTime } from "@/lib/utc-format";
import type { Price } from "@/modules/prices/types";
import type { SubscriptionSchedule } from "@/modules/subscription-schedules/types";
import type { Subscription } from "@/modules/subscriptions/types";

type SchedulePriceOption = {
  id: string;
  label: string;
  interval: "month" | "year";
  usageType: "licensed" | "metered";
  currency: string;
  meter: string | null;
};

function toUtcDateTimeInputValue(unix: number) {
  const date = new Date(unix * 1000);
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

function statusLabel(status: SubscriptionSchedule["status"]) {
  if (status === "not_started") return "Pending";
  if (status === "active") return "Active";
  if (status === "completed") return "Completed";
  if (status === "canceled") return "Canceled";
  return "Released";
}

export function ManageSubscriptionScheduleDialog({
  subscription,
  schedule,
  currentPrice,
  priceOptions,
  onUpdated,
}: {
  subscription: Subscription;
  schedule: SubscriptionSchedule;
  currentPrice: Price;
  priceOptions: SchedulePriceOption[];
  onUpdated: () => void;
}) {
  const [initialNowUnix] = useState(() => Math.floor(Date.now() / 1000));
  const editableStartUnix =
    schedule.current_phase?.end_date ??
    Math.max(
      initialNowUnix,
      schedule.phases[0]?.start_date ?? initialNowUnix
    );
  const finalEndUnix =
    schedule.phases[schedule.phases.length - 1]?.end_date ??
    subscription.current_period_end;
  const isEditable = schedule.status === "active" || schedule.status === "not_started";
  const locksStart = schedule.status === "active" && Boolean(schedule.current_phase);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"update" | "cancel" | "release" | null>(null);
  const [mode, setMode] = useState<"permanent" | "temporary">("permanent");
  const [selectedPriceId, setSelectedPriceId] = useState(priceOptions[0]?.id ?? "");
  const [effectiveAt, setEffectiveAt] = useState(() =>
    toUtcDateTimeInputValue(editableStartUnix)
  );
  const [revertAt, setRevertAt] = useState(() =>
    toUtcDateTimeInputValue(Math.min(editableStartUnix + 7 * 24 * 60 * 60, finalEndUnix))
  );
  const [endBehavior, setEndBehavior] =
    useState<SubscriptionSchedule["end_behavior"]>(schedule.end_behavior);
  const [error, setError] = useState<string | null>(null);

  const priceLabelById = useMemo(() => {
    const labels = new Map(priceOptions.map((option) => [option.id, option.label]));
    labels.set(currentPrice.id, currentPrice.nickname ?? currentPrice.id);
    return labels;
  }, [currentPrice.id, currentPrice.nickname, priceOptions]);

  async function postScheduleAction(path: string, action: "cancel" | "release") {
    setLoading(action);
    setError(null);

    const res = await fetch(path, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? `Failed to ${action} schedule`);
      setLoading(null);
      return;
    }

    setLoading(null);
    setOpen(false);
    onUpdated();
  }

  async function handleUpdate() {
    if (!selectedPriceId) {
      setError("Select a replacement price");
      return;
    }

    const startUnix = locksStart ? editableStartUnix : toUtcUnix(effectiveAt);
    if (!Number.isFinite(startUnix)) {
      setError("Choose a valid effective date");
      return;
    }

    if (startUnix >= finalEndUnix) {
      setError("The replacement phase must start before the schedule ends");
      return;
    }

    const phases =
      mode === "temporary"
        ? [
            {
              price: selectedPriceId,
              start_date: startUnix,
              end_date: toUtcUnix(revertAt),
            },
            {
              price: currentPrice.id,
              start_date: toUtcUnix(revertAt),
              end_date: finalEndUnix,
            },
          ]
        : [
            {
              price: selectedPriceId,
              start_date: startUnix,
              end_date: finalEndUnix,
            },
          ];

    if (mode === "temporary") {
      const revertUnix = toUtcUnix(revertAt);
      if (!Number.isFinite(revertUnix)) {
        setError("Choose a valid revert date");
        return;
      }
      if (revertUnix <= startUnix || revertUnix > finalEndUnix) {
        setError("The revert date must be after the start and before the schedule ends");
        return;
      }
    }

    setLoading("update");
    setError(null);

    const res = await fetch(`/api/subscription_schedules/${schedule.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        end_behavior: endBehavior,
        phases,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to update subscription schedule");
      setLoading(null);
      return;
    }

    setLoading(null);
    setOpen(false);
    onUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <CalendarClock />
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Manage price schedule</DialogTitle>
          <DialogDescription>
            Review the scheduled pricing phases for {subscription.id}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{statusLabel(schedule.status)}</Badge>
            <Badge variant="secondary">End: {schedule.end_behavior}</Badge>
            {schedule.current_phase ? (
              <Badge variant="secondary">
                Current until {formatUtcDateTime(schedule.current_phase.end_date)}
              </Badge>
            ) : null}
          </div>

          <div className="rounded-lg border">
            {schedule.phases.map((phase, index) => (
              <div
                key={`${phase.start_date}-${phase.end_date}-${phase.price}`}
                className="grid gap-1 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    Phase {index + 1}: {priceLabelById.get(phase.price) ?? phase.price}
                  </span>
                  <code className="text-xs text-muted-foreground">{phase.price}</code>
                </div>
                <span className="text-muted-foreground">
                  {formatUtcDateTime(phase.start_date)} to{" "}
                  {formatUtcDateTime(phase.end_date)}
                </span>
              </div>
            ))}
          </div>

          {isEditable ? (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`schedule-edit-price-${schedule.id}`}>
                  Replacement price
                </Label>
                <select
                  id={`schedule-edit-price-${schedule.id}`}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={selectedPriceId}
                  onChange={(event) => setSelectedPriceId(event.target.value)}
                  disabled={priceOptions.length === 0}
                >
                  {priceOptions.length === 0 ? (
                    <option value="">No compatible prices</option>
                  ) : null}
                  {priceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`schedule-edit-mode-${schedule.id}`}>Change type</Label>
                <select
                  id={`schedule-edit-mode-${schedule.id}`}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as "permanent" | "temporary")
                  }
                >
                  <option value="permanent">Permanent change</option>
                  <option value="temporary">Temporary discount</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`schedule-edit-effective-${schedule.id}`}>
                  Effective at (UTC)
                </Label>
                <Input
                  id={`schedule-edit-effective-${schedule.id}`}
                  type="datetime-local"
                  value={locksStart ? toUtcDateTimeInputValue(editableStartUnix) : effectiveAt}
                  onChange={(event) => setEffectiveAt(event.target.value)}
                  disabled={locksStart}
                />
              </div>

              {mode === "temporary" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`schedule-edit-revert-${schedule.id}`}>
                    Revert at (UTC)
                  </Label>
                  <Input
                    id={`schedule-edit-revert-${schedule.id}`}
                    type="datetime-local"
                    value={revertAt}
                    onChange={(event) => setRevertAt(event.target.value)}
                  />
                </div>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor={`schedule-edit-end-${schedule.id}`}>End behavior</Label>
                <select
                  id={`schedule-edit-end-${schedule.id}`}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={endBehavior}
                  onChange={(event) =>
                    setEndBehavior(event.target.value as SubscriptionSchedule["end_behavior"])
                  }
                >
                  <option value="release">Release</option>
                  <option value="cancel">Cancel subscription at schedule end</option>
                </select>
              </div>

              <p className="text-xs text-muted-foreground">
                Editable phases must end by {formatUtcDateTime(finalEndUnix)}.
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          {isEditable ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(loading)}
                onClick={() =>
                  postScheduleAction(
                    `/api/subscription_schedules/${schedule.id}/cancel`,
                    "cancel"
                  )
                }
              >
                {loading === "cancel" ? "Canceling..." : "Cancel schedule"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(loading)}
                onClick={() =>
                  postScheduleAction(
                    `/api/subscription_schedules/${schedule.id}/release`,
                    "release"
                  )
                }
              >
                {loading === "release" ? "Releasing..." : "Release schedule"}
              </Button>
              <Button
                size="sm"
                disabled={Boolean(loading) || priceOptions.length === 0}
                onClick={handleUpdate}
              >
                {loading === "update" ? "Saving..." : "Update future phases"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
