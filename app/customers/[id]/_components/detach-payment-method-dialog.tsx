"use client";

import { useState } from "react";
import { Unlink } from "lucide-react";
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
import type { PaymentMethod } from "@/modules/payment-methods/types";

export function DetachPaymentMethodDialog({
  paymentMethod,
  onDetached,
}: {
  paymentMethod: PaymentMethod;
  onDetached: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDetach() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/payment_methods/${paymentMethod.id}/detach`, {
      method: "POST",
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to detach payment method");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onDetached();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Unlink />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detach payment method</DialogTitle>
          <DialogDescription>
            Detach {paymentMethod.id} from this customer. This cannot be undone.
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
            onClick={handleDetach}
          >
            {loading ? "Detaching..." : "Detach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
