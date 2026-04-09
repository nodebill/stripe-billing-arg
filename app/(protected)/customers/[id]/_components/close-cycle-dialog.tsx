"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
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
import { formatUtcDateRange } from "@/lib/utc-format";

export function CloseCycleDialog({
  subscription,
  onClosed,
}: {
  subscription: Subscription;
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/subscriptions/${subscription.id}/close_cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to close subscription cycle");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onClosed();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <RefreshCw />
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Close current cycle</DialogTitle>
          <DialogDescription className="break-words">
            Process exactly one overdue cycle for {subscription.id}. This will
            create the renewal invoice, finalize it, and collect or send it using
            the subscription collection method.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
          <p>
            <span className="font-medium">Current cycle:</span>{" "}
            {formatUtcDateRange(
              subscription.current_period_start,
              subscription.current_period_end
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            Collection method: {subscription.collection_method}
          </p>
        </div>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={loading} onClick={handleSubmit}>
            {loading ? "Closing..." : "Close cycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
