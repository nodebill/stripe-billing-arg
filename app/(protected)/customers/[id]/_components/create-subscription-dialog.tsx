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
  interval: "month" | "year";
  usageType: "licensed" | "metered";
};

const BILLING_CYCLE_MODES = [
  { value: "start_today", label: "Start today" },
  { value: "align_renewal", label: "Align renewal date" },
  { value: "backdate_start", label: "Backdate start date" },
  { value: "historical_exact_cycle", label: "Historical exact cycle" },
] as const;

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function getFirstDayOfCurrentUtcMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(1).padStart(2, "0")}`;
}

function toUtcMidnightTimestamp(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
}

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
  const [billingCycleMode, setBillingCycleMode] = useState<
    | "start_today"
    | "align_renewal"
    | "backdate_start"
    | "historical_exact_cycle"
  >("start_today");
  const [billingDayOfMonth, setBillingDayOfMonth] = useState("1");
  const [billingMonth, setBillingMonth] = useState(
    String(new Date().getUTCMonth() + 1)
  );
  const [backdateStartDate, setBackdateStartDate] = useState(
    getFirstDayOfCurrentUtcMonth()
  );
  const [prorationBehavior, setProrationBehavior] = useState<
    "create_prorations" | "none"
  >("create_prorations");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPrice =
    priceOptions.find((price) => price.id === priceId) ?? priceOptions[0] ?? null;
  const requiresPaymentMethod = collectionMethod === "charge_automatically";
  const isMeteredPrice = selectedPrice?.usageType === "metered";
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
      setBillingCycleMode("start_today");
      setBillingDayOfMonth("1");
      setBillingMonth(String(new Date().getUTCMonth() + 1));
      setBackdateStartDate(getFirstDayOfCurrentUtcMonth());
      setProrationBehavior("create_prorations");
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

    if (
      (billingCycleMode === "backdate_start" ||
        billingCycleMode === "historical_exact_cycle") &&
      !backdateStartDate
    ) {
      setError("Select a backdated start date");
      return;
    }

    setLoading(true);
    setError(null);

    const requestBody: Record<string, unknown> = {
      customer: customerId,
      collection_method: collectionMethod,
      default_payment_method:
        collectionMethod === "charge_automatically" ? paymentMethodId : undefined,
      proration_behavior:
        isMeteredPrice || billingCycleMode === "historical_exact_cycle"
          ? "none"
          : prorationBehavior,
      items: [{ price: priceId }],
    };

    if (billingCycleMode === "align_renewal") {
      requestBody.billing_cycle_anchor_config =
        selectedPrice?.interval === "year"
          ? {
              month: Number(billingMonth),
              day_of_month: Number(billingDayOfMonth),
            }
          : {
              day_of_month: Number(billingDayOfMonth),
            };
    }

    if (
      billingCycleMode === "backdate_start" ||
      billingCycleMode === "historical_exact_cycle"
    ) {
      requestBody.backdate_start_date = toUtcMidnightTimestamp(backdateStartDate);
    }

    if (billingCycleMode === "historical_exact_cycle") {
      requestBody.backdate_behavior = "preserve_exact_cycle";
    }

    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-cycle-mode">Billing cycle</Label>
            <select
              id="billing-cycle-mode"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={billingCycleMode}
              onChange={(e) =>
                setBillingCycleMode(
                  e.target.value as
                    | "start_today"
                    | "align_renewal"
                    | "backdate_start"
                    | "historical_exact_cycle"
                )
              }
              disabled={loading}
            >
              {BILLING_CYCLE_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Choose whether billing starts now, aligns to a renewal anchor, or
              begins from a historical cycle that stays pending manual catch-up.
            </p>
          </div>

          {billingCycleMode === "align_renewal" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedPrice?.interval === "year" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="billing-month">Renewal month</Label>
                  <select
                    id="billing-month"
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    disabled={loading}
                  >
                    {MONTH_OPTIONS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="billing-day-of-month">Renewal day</Label>
                <select
                  id="billing-day-of-month"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={billingDayOfMonth}
                  onChange={(e) => setBillingDayOfMonth(e.target.value)}
                  disabled={loading}
                >
                  {Array.from({ length: 31 }, (_, index) => String(index + 1)).map(
                    (day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          ) : null}

          {billingCycleMode === "backdate_start" ||
          billingCycleMode === "historical_exact_cycle" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backdate-start-date">Backdated start date</Label>
              <input
                id="backdate-start-date"
                type="date"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={backdateStartDate}
                onChange={(e) => setBackdateStartDate(e.target.value)}
                disabled={loading}
              />
              {billingCycleMode === "historical_exact_cycle" ? (
                <p className="text-xs text-muted-foreground">
                  The subscription will keep this exact historical cycle and stay
                  in manual catch-up mode until an operator closes overdue cycles.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proration-behavior">Proration</Label>
            <select
              id="proration-behavior"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              value={isMeteredPrice ? "none" : prorationBehavior}
              onChange={(e) =>
                setProrationBehavior(
                  e.target.value as "create_prorations" | "none"
                )
              }
              disabled={
                loading ||
                isMeteredPrice ||
                billingCycleMode === "historical_exact_cycle"
              }
            >
              <option value="create_prorations">Create prorations</option>
              <option value="none">None</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {isMeteredPrice
                ? "Metered prices only support proration_behavior=none in this version."
                : billingCycleMode === "historical_exact_cycle"
                  ? "Historical exact cycles do not create an immediate proration invoice."
                  : "Applies when the initial billing period is anchored or backdated."}
            </p>
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
