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
import { Switch } from "@/components/ui/switch";
import type { PriceType } from "@/modules/prices/types";

export function CreatePriceDialog({
  productId,
  onCreated,
}: {
  productId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>("one_time");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const currency = String(formData.get("currency") ?? "").toLowerCase();
    const body =
      priceType === "recurring"
        ? {
            product: productId,
            type: "recurring" as const,
            currency,
            unit_amount: Number(formData.get("unit_amount")),
            nickname: (formData.get("nickname") as string) || undefined,
            active: formData.get("active") === "on",
            recurring: {
              interval: formData.get("interval"),
              interval_count: 1,
            },
          }
        : {
            product: productId,
            type: "one_time" as const,
            currency,
            unit_amount: Number(formData.get("unit_amount")),
            nickname: (formData.get("nickname") as string) || undefined,
            active: formData.get("active") === "on",
          };

    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Something went wrong");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add price
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create price</DialogTitle>
          <DialogDescription>
            Add a one-time or recurring price for this product.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Billing type</Label>
            <select
              id="type"
              name="type"
              value={priceType}
              onChange={(e) => setPriceType(e.target.value as PriceType)}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="one_time">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                required
                defaultValue="usd"
                maxLength={3}
                placeholder="usd"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit_amount">Unit amount</Label>
              <Input
                id="unit_amount"
                name="unit_amount"
                type="number"
                min={1}
                required
                placeholder="1000"
              />
            </div>
          </div>
          {priceType === "recurring" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="interval">Interval</Label>
              <select
                id="interval"
                name="interval"
                defaultValue="month"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              name="nickname"
              placeholder="Optional internal label"
            />
            <p className="text-xs text-muted-foreground">
              Amounts use Stripe-style minor units, for example 1000 for $10.00.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="active" className="text-sm font-medium">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Available for new purchases
              </p>
            </div>
            <Switch id="active" name="active" defaultChecked />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Creating..." : "Create price"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
