"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReceiptText, X } from "lucide-react";
import { formatPriceAmount } from "@/app/(protected)/products/[id]/_components/price-format";
import { InvoiceDetailDialog } from "@/app/(protected)/billing/_components/invoice-detail-dialog";
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
import { formatUtcDateTime } from "@/lib/utc-format";
import type { Invoice, ListInvoicesParams, StripeInvoiceList } from "@/modules/invoices/types";

const PAGE_LIMIT = 200;
const SELECT_CLASS_NAME =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";
const STATUS_OPTIONS: Array<{
  value: Invoice["status"] | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "past_due", label: "Past due" },
];

function formatCollectionMethodLabel(
  collectionMethod: Invoice["collection_method"]
) {
  return collectionMethod === "charge_automatically"
    ? "Auto-charge"
    : "Send invoice";
}

function formatInvoiceStatus(status: Invoice["status"]) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function toFilterValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<Invoice["status"] | "all">("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ListInvoicesParams>({});

  const loadInvoices = useCallback(
    async (filters: ListInvoicesParams, startingAfter?: string) => {
      try {
        setError(null);

        const params = new URLSearchParams({
          limit: String(PAGE_LIMIT),
        });

        if (filters.status) {
          params.set("status", filters.status);
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

        const res = await fetch(`/api/invoices?${params}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message ?? "Failed to load invoices");
        }

        const list = data as StripeInvoiceList;
        if (startingAfter) {
          setInvoices((current) => [...current, ...list.data]);
        } else {
          setInvoices(list.data);
        }

        setHasMore(list.has_more);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invoices");
        if (!startingAfter) {
          setInvoices([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadInvoices(appliedFilters);
  }, [appliedFilters, loadInvoices]);

  function applyFilters() {
    setLoading(true);
    setAppliedFilters({
      status: statusFilter === "all" ? undefined : statusFilter,
      date_from: toFilterValue(dateFromFilter),
      date_to: toFilterValue(dateToFilter),
    });
  }

  function clearFilters() {
    setStatusFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setLoading(true);
    setAppliedFilters({});
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review generated invoices across all customers. Filter by invoice
          status and UTC creation date range.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-[180px_160px_160px_auto]">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as Invoice["status"] | "all")
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
          First load brings up to {PAGE_LIMIT} invoices. Pagination keeps the
          currently applied filters.
        </p>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading invoices...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="text-center">
            <p className="font-medium">Could not load invoices</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              void loadInvoices(appliedFilters);
            }}
          >
            Retry
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ReceiptText className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No invoices found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust the filters or clear them to inspect the full list.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Timing (UTC)</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="w-[88px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {invoice.id}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Subscription {invoice.subscription}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/customers/${invoice.customer}`}
                      className="font-medium hover:underline"
                    >
                      {invoice.customer}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "paid" || invoice.status === "open"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {formatInvoiceStatus(invoice.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCollectionMethodLabel(invoice.collection_method)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPriceAmount(String(invoice.amount_due), invoice.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.paid_at
                      ? `Paid ${formatUtcDateTime(invoice.paid_at)}`
                      : invoice.due_date
                        ? `Due ${formatUtcDateTime(invoice.due_date)}`
                        : invoice.finalized_at
                          ? `Finalized ${formatUtcDateTime(invoice.finalized_at)}`
                          : `Created ${formatUtcDateTime(invoice.created)}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.latest_delivery
                      ? `${invoice.latest_delivery.status === "sent" ? "Mock email sent" : "Pending send"}${
                          invoice.latest_delivery.recipient
                            ? ` to ${invoice.latest_delivery.recipient}`
                            : ""
                        }`
                      : "--"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <InvoiceDetailDialog invoice={invoice} />
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
                onClick={() => void loadInvoices(appliedFilters, invoices[invoices.length - 1]?.id)}
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
