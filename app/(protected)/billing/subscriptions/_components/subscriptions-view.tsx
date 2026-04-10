"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Repeat, Search, X } from "lucide-react";
import {
  formatPriceAmount,
  formatPriceType,
} from "@/app/(protected)/products/[id]/_components/price-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUtcDate } from "@/lib/utc-format";
import type { Price } from "@/modules/prices/types";
import type { Product } from "@/modules/products/types";
import type {
  BulkCloseSubscriptionCyclesInput,
  BulkCloseSubscriptionCyclesResult,
  ListSubscriptionsParams,
  StripeSubscriptionList,
  Subscription,
} from "@/modules/subscriptions/types";
import { RefreshSubscriptionsDialog } from "./refresh-subscriptions-dialog";

const PAGE_LIMIT = 200;
const SELECT_CLASS_NAME =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";
const STATUS_OPTIONS: Array<{
  value: Subscription["status"];
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
];

function formatCollectionMethodLabel(
  collectionMethod: Subscription["collection_method"]
) {
  return collectionMethod === "charge_automatically"
    ? "Auto-charge"
    : "Send invoice";
}

function formatRenewalModeLabel(renewalMode: Subscription["renewal_mode"]) {
  return renewalMode === "manual_until_current"
    ? "Manual catch-up"
    : "Automatic";
}

function formatSubscriptionStatus(status: Subscription["status"]) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function toFilterValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function SubscriptionsView() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pricesById, setPricesById] = useState<Record<string, Price>>({});
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Subscription["status"]>("active");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ListSubscriptionsParams>({
    status: "active",
  });
  const [refreshResult, setRefreshResult] =
    useState<BulkCloseSubscriptionCyclesResult | null>(null);

  const hydratePriceDetails = useCallback(
    async (items: Subscription[]) => {
      const missingPriceIds = Array.from(
        new Set(
          items
            .map((subscription) => subscription.items[0]?.price)
            .filter((priceId): priceId is string => Boolean(priceId))
        )
      ).filter((priceId) => !pricesById[priceId]);

      if (missingPriceIds.length === 0) {
        return;
      }

      const fetchedPrices = (
        await Promise.all(
          missingPriceIds.map(async (priceId) => {
            const res = await fetch(`/api/prices/${priceId}`);
            if (!res.ok) {
              return null;
            }

            return (await res.json()) as Price;
          })
        )
      ).filter((price): price is Price => Boolean(price));

      if (fetchedPrices.length === 0) {
        return;
      }

      setPricesById((current) => {
        const next = { ...current };
        for (const price of fetchedPrices) {
          next[price.id] = price;
        }
        return next;
      });

      const missingProductIds = Array.from(
        new Set(fetchedPrices.map((price) => price.product))
      ).filter((productId) => !productsById[productId]);

      if (missingProductIds.length === 0) {
        return;
      }

      const fetchedProducts = (
        await Promise.all(
          missingProductIds.map(async (productId) => {
            const res = await fetch(`/api/products/${productId}`);
            if (!res.ok) {
              return null;
            }

            return (await res.json()) as Product;
          })
        )
      ).filter((product): product is Product => Boolean(product));

      if (fetchedProducts.length === 0) {
        return;
      }

      setProductsById((current) => {
        const next = { ...current };
        for (const product of fetchedProducts) {
          next[product.id] = product;
        }
        return next;
      });
    },
    [pricesById, productsById]
  );

  const loadSubscriptions = useCallback(
    async (filters: ListSubscriptionsParams, startingAfter?: string) => {
      try {
        setError(null);

        const params = new URLSearchParams({
          limit: String(PAGE_LIMIT),
          status: filters.status ?? "active",
        });

        if (filters.customer) {
          params.set("customer", filters.customer);
        }

        if (filters.subscription) {
          params.set("subscription", filters.subscription);
        }

        if (filters.date_from) {
          params.set("date_from", filters.date_from);
        }

        if (filters.date_to) {
          params.set("date_to", filters.date_to);
        }

        if (startingAfter) {
          params.set("starting_after", startingAfter);
        }

        const res = await fetch(`/api/subscriptions?${params}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message ?? "Failed to load subscriptions");
        }

        const list = data as StripeSubscriptionList;
        await hydratePriceDetails(list.data);

        if (startingAfter) {
          setSubscriptions((current) => [...current, ...list.data]);
        } else {
          setSubscriptions(list.data);
        }

        setHasMore(list.has_more);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load subscriptions"
        );

        if (!startingAfter) {
          setSubscriptions([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [hydratePriceDetails]
  );

  useEffect(() => {
    void loadSubscriptions(appliedFilters);
  }, [appliedFilters, loadSubscriptions]);

  const refreshFilters: BulkCloseSubscriptionCyclesInput = {
    customer: appliedFilters.customer,
    subscription: appliedFilters.subscription,
    status: appliedFilters.status,
    date_from: appliedFilters.date_from,
    date_to: appliedFilters.date_to,
  };
  const hasNarrowingFilters = Boolean(
    refreshFilters.customer ||
      refreshFilters.subscription ||
      refreshFilters.date_from ||
      refreshFilters.date_to
  );
  const canRefresh =
    (refreshFilters.status ?? "active") === "active" && hasNarrowingFilters;

  function formatPriceLabel(subscription: Subscription) {
    const priceId = subscription.items[0]?.price;
    if (!priceId) {
      return "Unknown price";
    }

    const price = pricesById[priceId];
    if (!price) {
      return priceId;
    }

    const productName = productsById[price.product]?.name ?? price.product;
    return `${productName} • ${
      price.nickname ||
      formatPriceAmount(price.unit_amount_decimal, price.currency)
    } • ${formatPriceType(price)}`;
  }

  function applyFilters() {
    setLoading(true);
    setRefreshResult(null);
    setAppliedFilters({
      customer: toFilterValue(customerFilter),
      subscription: toFilterValue(subscriptionFilter),
      status: statusFilter,
      date_from: toFilterValue(dateFromFilter),
      date_to: toFilterValue(dateToFilter),
    });
  }

  function clearFilters() {
    setCustomerFilter("");
    setSubscriptionFilter("");
    setStatusFilter("active");
    setDateFromFilter("");
    setDateToFilter("");
    setLoading(true);
    setRefreshResult(null);
    setAppliedFilters({ status: "active" });
  }

  async function handleRefreshed(result: BulkCloseSubscriptionCyclesResult) {
    setRefreshResult(result);
    setLoading(true);
    await loadSubscriptions(appliedFilters);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Subscriptions</h1>
          <p className="mt-1 text-base text-[#615d59]">
            Review subscriptions across customers, filter by status and UTC
            period-end date, and refresh filtered overdue active cycles.
          </p>
        </div>
        <RefreshSubscriptionsDialog
          filters={refreshFilters}
          onRefreshed={(result) => void handleRefreshed(result)}
          disabled={!canRefresh}
          disabledReason={
            (refreshFilters.status ?? "active") !== "active"
              ? "Refresh only runs for active subscriptions."
              : "Add a customer, subscription, or date filter before refreshing."
          }
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_160px_160px_auto]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by customer_id"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by subscription_id"
              value={subscriptionFilter}
              onChange={(event) => setSubscriptionFilter(event.target.value)}
              className="pl-8"
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as Subscription["status"])
              }
              className={SELECT_CLASS_NAME}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">From (UTC)</span>
            <Input
              type="date"
              value={dateFromFilter}
              max={dateToFilter || undefined}
              onChange={(event) => setDateFromFilter(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">To (UTC)</span>
            <Input
              type="date"
              value={dateToFilter}
              min={dateFromFilter || undefined}
              onChange={(event) => setDateToFilter(event.target.value)}
            />
          </label>
          <div className="flex gap-2 self-end">
            <Button variant="outline" onClick={clearFilters}>
              <X />
              Clear
            </Button>
            <Button onClick={applyFilters}>Apply</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          First load brings up to {PAGE_LIMIT} subscriptions for the selected
          status. `Refresh` only runs for active subscriptions narrowed by
          customer, subscription, or UTC date range.
        </p>
      </div>

      {refreshResult ? (
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Matched {refreshResult.matched_subscriptions}
            </Badge>
            <Badge variant="outline">
              Processed {refreshResult.processed_subscriptions}
            </Badge>
            <Badge variant="outline">
              Skipped {refreshResult.skipped_subscriptions}
            </Badge>
            <Badge variant="outline">
              Failed {refreshResult.failed_subscriptions}
            </Badge>
          </div>
          {refreshResult.results.some((result) => result.status !== "processed") ? (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              {refreshResult.results
                .filter((result) => result.status !== "processed")
                .slice(0, 5)
                .map((result) => (
                  <p key={result.subscription_id}>
                    {result.subscription_id}: {result.message}
                  </p>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && subscriptions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading subscriptions...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border py-16">
          <div className="text-center">
            <p className="font-medium">Could not load subscriptions</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              void loadSubscriptions(appliedFilters);
            }}
          >
            Retry
          </Button>
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Repeat className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No subscriptions found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust the filters or clear them to inspect another segment.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Renewal mode</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Period end</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <Link
                      href={`/customers/${subscription.customer}`}
                      className="font-medium hover:underline"
                    >
                      {subscription.customer}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        subscription.status === "active" ? "outline" : "secondary"
                      }
                    >
                      {formatSubscriptionStatus(subscription.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPriceLabel(subscription)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRenewalModeLabel(subscription.renewal_mode)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCollectionMethodLabel(subscription.collection_method)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatUtcDate(subscription.current_period_end)}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {subscription.id}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link
                        href={`/customers/${subscription.customer}`}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        View customer
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {hasMore ? (
            <div className="flex justify-center border-t px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void loadSubscriptions(
                    appliedFilters,
                    subscriptions[subscriptions.length - 1]?.id
                  )
                }
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
