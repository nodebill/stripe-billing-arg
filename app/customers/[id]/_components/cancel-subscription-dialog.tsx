"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
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

export function CancelSubscriptionDialog({
  subscription,
  onCanceled,
}: {
  subscription: Subscription;
  onCanceled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/subscriptions/${subscription.id}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to cancel subscription");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onCanceled();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Ban />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel subscription now</DialogTitle>
          <DialogDescription>
            Cancel {subscription.id} immediately. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading}
            onClick={handleCancel}
          >
            {loading ? "Canceling..." : "Cancel now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
