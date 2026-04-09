"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { formatPriceAmount } from "@/app/(protected)/products/[id]/_components/price-format";
import { InvoiceDetailDialog } from "@/app/(protected)/billing/_components/invoice-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUtcDateTime } from "@/lib/utc-format";
import type { Invoice, StripeInvoiceList } from "@/modules/invoices/types";

const PAGE_LIMIT = 200;

function formatCollectionMethodLabel(
  collectionMethod: Invoice["collection_method"]
) {
  return collectionMethod === "charge_automatically"
    ? "Auto-charge"
    : "Send invoice";
}

function formatInvoiceStatus(status: Invoice["status"]) {
  if (status === "past_due") {
    return "Past due";
  }

  if (status === "open") {
    return "Open";
  }

  if (status === "paid") {
    return "Paid";
  }

  return "Draft";
}

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(async (startingAfter?: string) => {
    try {
      setError(null);

      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
      });

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
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the latest generated invoices across all customers. First load
          brings up to {PAGE_LIMIT} invoices.
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
          <Button variant="outline" onClick={() => void loadInvoices()}>
            Retry
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ReceiptText className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Renewal processing will surface invoices here as they are created.
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
                onClick={() =>
                  void loadInvoices(invoices[invoices.length - 1]?.id)
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
