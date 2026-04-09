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
import type {
  BulkCloseSubscriptionCyclesInput,
  BulkCloseSubscriptionCyclesResult,
} from "@/modules/subscriptions/types";

type RefreshSubscriptionsDialogProps = {
  disabled: boolean;
  filters: BulkCloseSubscriptionCyclesInput;
  onRefreshed: (result: BulkCloseSubscriptionCyclesResult) => void;
};

export function RefreshSubscriptionsDialog({
  disabled,
  filters,
  onRefreshed,
}: RefreshSubscriptionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/subscriptions/close_cycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to refresh subscriptions");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onRefreshed(data as BulkCloseSubscriptionCyclesResult);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (loading) {
          return;
        }

        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={disabled} />}
      >
        <RefreshCw />
        Refresh
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Refresh filtered subscriptions</DialogTitle>
          <DialogDescription>
            This will close exactly one overdue billing cycle for each active
            subscription that matches the current filters.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
          <p>
            <span className="font-medium">Customer:</span>{" "}
            {filters.customer ?? "Any"}
          </p>
          <p className="mt-1">
            <span className="font-medium">Subscription:</span>{" "}
            {filters.subscription ?? "Any"}
          </p>
        </div>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={loading} onClick={handleSubmit}>
            {loading ? "Refreshing..." : "Run refresh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
