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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreatePaymentMethodDialog({
  customerId,
  onCreated,
}: {
  customerId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const billingName = String(formData.get("billing-name") ?? "").trim();

    try {
      const createRes = await fetch("/api/payment_methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "custom",
          billing_details: billingName ? { name: billingName } : undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error?.message ?? "Failed to create payment method");
      }

      const attachRes = await fetch(`/api/payment_methods/${createData.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: customerId }),
      });

      const attachData = await attachRes.json();
      if (!attachRes.ok) {
        throw new Error(attachData.error?.message ?? "Failed to attach payment method");
      }

      setOpen(false);
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create payment method"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add payment method
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Create payment method</DialogTitle>
          <DialogDescription>
            Create a custom payment method and attach it to this customer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-name">Billing name</Label>
            <Input
              id="billing-name"
              name="billing-name"
              placeholder="Optional display name"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Saving..." : "Create and attach"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
