"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { Label } from "@/components/ui/label";

type PaymentMethodOption = {
  id: string;
  label: string;
};

type PriceOption = {
  id: string;
  label: string;
};

export function CreateSubscriptionDialog({
  customerId,
  paymentMethodOptions,
  priceOptions,
  onCreated,
}: {
  customerId: string;
  paymentMethodOptions: PaymentMethodOption[];
  priceOptions: PriceOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [collectionMethod, setCollectionMethod] = useState<
    "charge_automatically" | "send_invoice"
  >("charge_automatically");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresPaymentMethod = collectionMethod === "charge_automatically";
  const disabled =
    priceOptions.length === 0 ||
    (requiresPaymentMethod && paymentMethodOptions.length === 0) ||
    loading;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      setCollectionMethod("charge_automatically");
      setPaymentMethodId(paymentMethodOptions[0]?.id ?? "");
      setPriceId(priceOptions[0]?.id ?? "");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!priceId) {
      setError("Select a recurring price");
      return;
    }

    if (requiresPaymentMethod && !paymentMethodId) {
      setError("Select a payment method for auto-charge subscriptions");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: customerId,
        collection_method: collectionMethod,
        default_payment_method:
          collectionMethod === "charge_automatically" ? paymentMethodId : undefined,
        items: [{ price: priceId }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to create subscription");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <Plus data-icon="inline-start" />
        Create subscription
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create subscription</DialogTitle>
          <DialogDescription>
            Create a subscription for this customer with one recurring price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection-method">Collection method</Label>
            <select
              id="collection-method"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={collectionMethod}
              onChange={(e) =>
                setCollectionMethod(
                  e.target.value as "charge_automatically" | "send_invoice"
                )
              }
              disabled={loading}
            >
              <option value="charge_automatically">Charge automatically</option>
              <option value="send_invoice">Send invoice</option>
            </select>
          </div>

          {collectionMethod === "charge_automatically" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="default-payment-method">Payment method</Label>
              <select
                id="default-payment-method"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                disabled={loading || paymentMethodOptions.length === 0}
              >
                {paymentMethodOptions.length === 0 ? (
                  <option value="">No attached payment methods</option>
                ) : null}
                {paymentMethodOptions.map((paymentMethod) => (
                  <option key={paymentMethod.id} value={paymentMethod.id}>
                    {paymentMethod.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Renewal runs will mock-send invoices without using a stored payment
              method.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-price">Recurring price</Label>
            <select
              id="recurring-price"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={priceId}
              onChange={(e) => setPriceId(e.target.value)}
              disabled={loading || priceOptions.length === 0}
            >
              {priceOptions.length === 0 ? (
                <option value="">No active recurring prices</option>
              ) : null}
              {priceOptions.map((price) => (
                <option key={price.id} value={price.id}>
                  {price.label}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" size="sm" disabled={disabled}>
              {loading ? "Creating..." : "Create subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
