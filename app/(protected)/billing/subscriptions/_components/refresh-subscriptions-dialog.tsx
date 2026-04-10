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
  filters: BulkCloseSubscriptionCyclesInput;
  onRefreshed: (result: BulkCloseSubscriptionCyclesResult) => void;
  disabled?: boolean;
  disabledReason?: string;
};

export function RefreshSubscriptionsDialog({
  filters,
  onRefreshed,
  disabled = false,
  disabledReason,
}: RefreshSubscriptionsDialogProps) {
  const hasFilters = Boolean(
    filters.customer || filters.subscription || filters.date_from || filters.date_to
  );
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
        if (loading || disabled) {
          return;
        }

        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
          />
        }
      >
        <RefreshCw />
        Refresh
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Refresh subscriptions</DialogTitle>
          <DialogDescription>
            {hasFilters
              ? "This will create or refresh exactly one draft invoice for each overdue active subscription that matches the current filters."
              : "No exact filters are applied. This will create or refresh exactly one draft invoice for every overdue active subscription."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
          <p>
            <span className="font-medium">Status:</span> {filters.status ?? "active"}
          </p>
          <p className="mt-1">
            <span className="font-medium">Customer:</span>{" "}
            {filters.customer ?? "Any"}
          </p>
          <p className="mt-1">
            <span className="font-medium">Subscription:</span>{" "}
            {filters.subscription ?? "Any"}
          </p>
          <p className="mt-1">
            <span className="font-medium">From:</span> {filters.date_from ?? "Any"}
          </p>
          <p className="mt-1">
            <span className="font-medium">To:</span> {filters.date_to ?? "Any"}
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
