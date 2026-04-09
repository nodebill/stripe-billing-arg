"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateMeterDialog } from "@/app/(protected)/billing/meters/_components/create-meter-dialog";
import { MetadataEditor } from "@/components/metadata-editor";
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
import type { Meter } from "@/modules/meters/types";
import type { PriceType } from "@/modules/prices/types";

type MeterOption = {
  id: string;
  label: string;
};

export function CreatePriceDialog({
  productId,
  meterOptions,
  onMeterCreated,
  onCreated,
}: {
  productId: string;
  meterOptions: MeterOption[];
  onMeterCreated: (meter: Meter) => void | Promise<void>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>("one_time");
  const [usageType, setUsageType] = useState<"licensed" | "metered">("licensed");
  const [selectedMeterId, setSelectedMeterId] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  const resolvedMeterId = meterOptions.some((meter) => meter.id === selectedMeterId)
    ? selectedMeterId
    : meterOptions[0]?.id ?? "";

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      setError(null);
      setPriceType("one_time");
      setUsageType("licensed");
      setSelectedMeterId(meterOptions[0]?.id ?? "");
      setMetadata({});
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (
      priceType === "recurring" &&
      usageType === "metered" &&
      !resolvedMeterId
    ) {
      setError("Create or select an active meter before saving this price");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const currency = String(formData.get("currency") ?? "").toLowerCase();
    const unitAmount = String(formData.get("unit_amount") ?? "").trim();
    const unitAmountDecimal = String(
      formData.get("unit_amount_decimal") ?? ""
    ).trim();
    const amountField = unitAmountDecimal
      ? { unit_amount_decimal: unitAmountDecimal }
      : { unit_amount: Number(unitAmount) };
    const hasMetadata = Object.keys(metadata).length > 0;
    const body =
      priceType === "recurring"
        ? {
            product: productId,
            type: "recurring" as const,
            currency,
            ...amountField,
            nickname: (formData.get("nickname") as string) || undefined,
            active: formData.get("active") === "on",
            metadata: hasMetadata ? metadata : undefined,
            recurring: {
              interval: formData.get("interval"),
              interval_count: 1,
              usage_type: usageType,
            },
            meter: usageType === "metered" ? resolvedMeterId : undefined,
          }
        : {
            product: productId,
            type: "one_time" as const,
            currency,
            ...amountField,
            nickname: (formData.get("nickname") as string) || undefined,
            active: formData.get("active") === "on",
            metadata: hasMetadata ? metadata : undefined,
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

  async function handleInlineMeterCreated(meter: Meter) {
    await onMeterCreated(meter);
    setSelectedMeterId(meter.id);
  }

  const canSubmit =
    !loading &&
    !(
      priceType === "recurring" &&
      usageType === "metered" &&
      meterOptions.length === 0
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add price
      </DialogTrigger>
      <DialogContent size="lg">
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
                required={priceType !== "recurring" || usageType !== "metered"}
                placeholder="1000"
              />
            </div>
          </div>
          {priceType === "recurring" && (
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="usage_type">Usage type</Label>
                <select
                  id="usage_type"
                  name="usage_type"
                  value={usageType}
                  onChange={(e) => {
                    const nextUsageType = e.target.value as "licensed" | "metered";
                    setUsageType(nextUsageType);
                    if (nextUsageType === "metered" && !resolvedMeterId) {
                      setSelectedMeterId(meterOptions[0]?.id ?? "");
                    }
                  }}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="licensed">Licensed</option>
                  <option value="metered">Metered</option>
                </select>
              </div>
            </div>
          )}
          {priceType === "recurring" && usageType === "metered" && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label htmlFor="meter">Meter</Label>
                  <CreateMeterDialog
                    onCreated={handleInlineMeterCreated}
                    trigger={
                      <Button type="button" variant="outline" size="sm">
                        Add meter
                      </Button>
                    }
                  />
                </div>
                <select
                  id="meter"
                  name="meter"
                  value={resolvedMeterId}
                  onChange={(e) => setSelectedMeterId(e.target.value)}
                  required={meterOptions.length > 0}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {meterOptions.length === 0 ? (
                    <option value="">No active meters available</option>
                  ) : null}
                  {meterOptions.map((meter) => (
                    <option key={meter.id} value={meter.id}>
                      {meter.label}
                    </option>
                  ))}
                </select>
                {meterOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No active meters yet. Create one here and keep going with this
                    price.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit_amount_decimal">Decimal unit amount</Label>
                <Input
                  id="unit_amount_decimal"
                  name="unit_amount_decimal"
                  inputMode="decimal"
                  placeholder="0.01"
                />
                <p className="text-xs text-muted-foreground">
                  If the meter reports processed cents, 1% maps to
                  `unit_amount_decimal` `0.01`.
                </p>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              name="nickname"
              placeholder="Optional internal label"
            />
            <p className="text-xs text-muted-foreground">
              Amounts use Stripe-style minor units. Use `1000` for $10.00 or
              `0.01` for one-hundredth of a cent.
            </p>
          </div>
          <MetadataEditor onChange={setMetadata} />
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
            <Button type="submit" disabled={!canSubmit} size="sm">
              {loading ? "Creating..." : "Create price"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
