"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Eye, ReceiptText, RefreshCw, Send, Stamp, X } from "lucide-react";
import { formatPriceAmount } from "@/app/(protected)/products/[id]/_components/price-format";
import { InvoiceDetailDialog } from "@/app/(protected)/billing/_components/invoice-detail-dialog";
import { IssuePreviewDialog } from "@/app/(protected)/billing/invoices/_components/issue-preview-dialog";
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
import type {
  Invoice,
  InvoiceBatchResult,
  InvoiceIssuePreviewResult,
  ListInvoicesParams,
  StripeInvoiceList,
} from "@/modules/invoices/types";

const PAGE_LIMIT = 200;
const SELECT_CLASS_NAME =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";
const STATUS_OPTIONS: Array<{
  value: Invoice["status"] | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "invoiced", label: "Invoiced" },
  { value: "sent", label: "Sent" },
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

function formatPaymentStatus(status: Invoice["payment_status"]) {
  if (status === "paid") {
    return "Paid";
  }

  if (status === "past_due") {
    return "Past due";
  }

  return "Pending";
}

function getTimingLabel(invoice: Invoice) {
  if (invoice.paid_at) {
    return `Paid ${formatUtcDateTime(invoice.paid_at)}`;
  }

  if (invoice.due_date) {
    return `Due ${formatUtcDateTime(invoice.due_date)}`;
  }

  if (invoice.invoiced_at) {
    return `Invoiced ${formatUtcDateTime(invoice.invoiced_at)}`;
  }

  return `Created ${formatUtcDateTime(invoice.created)}`;
}

function getDeliveryLabel(invoice: Invoice) {
  if (!invoice.latest_delivery) {
    return "--";
  }

  const channel =
    invoice.latest_delivery.channel === "email" ? "Email sent" : "Mock email sent";
  return invoice.latest_delivery.recipient
    ? `${channel} to ${invoice.latest_delivery.recipient}`
    : channel;
}

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<Invoice["status"] | "all">("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ListInvoicesParams>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    null | "refresh" | "preview" | "issue" | "send"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<InvoiceIssuePreviewResult | null>(
    null
  );

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
          setSelectedIds([]);
        }

        setHasMore(list.has_more);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invoices");
        if (!startingAfter) {
          setInvoices([]);
          setHasMore(false);
          setSelectedIds([]);
        }
      } finally {
        setLoading(false);
        setActionLoading(null);
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

  function toggleSelected(invoiceId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, invoiceId])] : current.filter((id) => id !== invoiceId)
    );
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? invoices.map((invoice) => invoice.id) : []);
  }

  async function runAction(
    action: "refresh" | "preview" | "issue" | "send",
    options?: { invoiceIds?: string[] }
  ) {
    setActionLoading(action);
    setActionMessage(null);
    setError(null);

    const request =
      action === "refresh"
        ? {
            url: "/api/internal/billing/process",
            init: { method: "POST" },
          }
        : {
            url:
              action === "preview"
                ? "/api/invoices/issue/preview"
                : `/api/invoices/${action}`,
            init: {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invoice_ids: options?.invoiceIds ?? selectedIds,
              }),
            },
          };

    const res = await fetch(request.url, request.init);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error?.message ?? `Failed to ${action} invoices`);
      setActionLoading(null);
      return;
    }

    if (action === "refresh") {
      const refreshedDrafts = Number(data.refreshed_drafts ?? 0);
      const createdInvoices = Number(data.created_invoices ?? 0);
      setActionMessage(
        `Draft refresh completed: ${createdInvoices} created, ${refreshedDrafts} refreshed.`
      );
    } else if (action === "preview") {
      setPreviewResult(data as InvoiceIssuePreviewResult);
      setPreviewOpen(true);
    } else {
      const result = data as InvoiceBatchResult;
      setActionMessage(
        `${action === "issue" ? "Emission" : "Send"} completed: ${result.processed_invoices} processed, ${result.failed_invoices} failed.`
      );
    }

    if (action !== "preview") {
      await loadInvoices(appliedFilters);
    } else {
      setActionLoading(null);
    }
  }

  const selectedInvoices = invoices.filter((invoice) => selectedIds.includes(invoice.id));
  const canIssue =
    selectedInvoices.length > 0 &&
    selectedInvoices.every((invoice) => invoice.status === "draft");
  const canSend =
    selectedInvoices.length > 0 &&
    selectedInvoices.every((invoice) => invoice.status === "invoiced");
  const allVisibleSelected =
    invoices.length > 0 && selectedIds.length === invoices.length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review drafts, preview AFIP payloads, issue legal documents, and send
          emitted invoices from one queue.
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(actionLoading)}
            onClick={() => void runAction("refresh")}
          >
            <RefreshCw />
            {actionLoading === "refresh" ? "Refreshing..." : "Refresh drafts"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canIssue || Boolean(actionLoading)}
            onClick={() => void runAction("preview")}
          >
            <Eye />
            {actionLoading === "preview" ? "Previewing..." : "Preview"}
          </Button>
          <Button
            size="sm"
            disabled={!canIssue || Boolean(actionLoading)}
            onClick={() => void runAction("issue")}
          >
            <Stamp />
            {actionLoading === "issue" ? "Issuing..." : "Emit"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSend || Boolean(actionLoading)}
            onClick={() => void runAction("send")}
          >
            <Send />
            {actionLoading === "send" ? "Sending..." : "Send"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          First load brings up to {PAGE_LIMIT} invoices. Pagination keeps the
          currently applied filters.
        </p>
      </div>

      {actionMessage ? (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          {actionMessage}
        </div>
      ) : null}

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
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="Select all invoices"
                  />
                </TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Payment</TableHead>
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
                    <input
                      type="checkbox"
                      className="size-4 rounded border"
                      checked={selectedIds.includes(invoice.id)}
                      onChange={(event) =>
                        toggleSelected(invoice.id, event.target.checked)
                      }
                      aria-label={`Select ${invoice.id}`}
                    />
                  </TableCell>
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
                      variant={invoice.status === "draft" ? "secondary" : "outline"}
                    >
                      {formatInvoiceStatus(invoice.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.payment_status === "paid" ? "outline" : "secondary"
                      }
                    >
                      {formatPaymentStatus(invoice.payment_status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCollectionMethodLabel(invoice.collection_method)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPriceAmount(String(invoice.amount_due), invoice.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getTimingLabel(invoice)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getDeliveryLabel(invoice)}
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
                onClick={() =>
                  void loadInvoices(
                    appliedFilters,
                    invoices[invoices.length - 1]?.id
                  )
                }
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <IssuePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        result={previewResult}
      />
    </div>
  );
}
