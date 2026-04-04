"use client";

import { useState } from "react";
import { CalendarX, RotateCcw } from "lucide-react";
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
import type { Subscription } from "@/modules/subscriptions/types";

export function ScheduleSubscriptionDialog({
  subscription,
  onUpdated,
}: {
  subscription: Subscription;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextValue = !subscription.cancel_at_period_end;

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/subscriptions/${subscription.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cancel_at_period_end: nextValue,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(
        data.error?.message ??
          "Failed to update subscription cancellation settings"
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        {subscription.cancel_at_period_end ? <RotateCcw /> : <CalendarX />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {subscription.cancel_at_period_end
              ? "Keep subscription active"
              : "Cancel at period end"}
          </DialogTitle>
          <DialogDescription>
            {subscription.cancel_at_period_end
              ? `Remove the pending period-end cancellation for ${subscription.id}.`
              : `Keep ${subscription.id} active until the current billing period ends.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={loading} onClick={handleSubmit}>
            {loading
              ? "Saving..."
              : subscription.cancel_at_period_end
                ? "Keep active"
                : "End at period end"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
