"use client";

import { useEffect, useState } from "react";
import { formatPriceAmount } from "@/app/(protected)/products/[id]/_components/price-format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUtcDateRange, formatUtcDateTime } from "@/lib/utc-format";
import type { Invoice, InvoiceDetail } from "@/modules/invoices/types";

function formatBillingReason(reason: InvoiceDetail["line_items"][number]["billing_reason"]) {
  if (reason === "metered_carryforward") {
    return "Late-reported carryforward";
  }

  return reason === "metered_recurring"
    ? "Metered recurring"
    : "Licensed recurring";
}

export function InvoiceDetailDialog({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/invoices/${invoice.id}`);
      const data = await res.json();

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        setError(data.error?.message ?? "Failed to load invoice details");
        setLoading(false);
        return;
      }

      setDetail(data);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [invoice.id, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setDetail(null);
          setError(null);
          setLoading(false);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Details
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Invoice details</DialogTitle>
          <DialogDescription>
            Review the billed periods and line items for {invoice.id}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Loading invoice details...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <p className="font-medium">Invoice period</p>
                <p className="mt-1 text-muted-foreground">
                  {formatUtcDateRange(detail.period_start, detail.period_end)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <p className="font-medium">Workflow</p>
                <p className="mt-1 text-muted-foreground">
                  {detail.status} • {detail.payment_status}
                </p>
                {detail.invoiced_at ? (
                  <p className="mt-1 text-muted-foreground">
                    Invoiced at {formatUtcDateTime(detail.invoiced_at)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatPriceAmount(String(detail.subtotal), detail.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA (21%)</span>
                  <span>{formatPriceAmount(String(detail.tax_amount), detail.currency)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span>Total</span>
                  <span>{formatPriceAmount(String(detail.amount_due), detail.currency)}</span>
                </div>
              </div>
            </div>

            {detail.legal_document ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Legal document</p>
                    <p className="mt-1 text-muted-foreground">
                      {detail.legal_document.invoice_type} {detail.legal_document.invoice_number} • CAE{" "}
                      {detail.legal_document.cae}
                    </p>
                  </div>
                  <a
                    href={detail.legal_document.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline underline-offset-4"
                  >
                    Open PDF
                  </a>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {detail.legal_document.receiver_name} • {detail.legal_document.receiver_tax_condition}
                </p>
                <p className="text-muted-foreground">
                  {detail.legal_document.receiver_tax_id} • {detail.legal_document.receiver_address}
                </p>
              </div>
            ) : null}

            <div className="min-w-0 overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Reason</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Billed period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.line_items.map((lineItem) => (
                    <TableRow key={lineItem.id}>
                      <TableCell className="font-medium">
                        {formatBillingReason(lineItem.billing_reason)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lineItem.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPriceAmount(String(lineItem.amount), lineItem.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatUtcDateRange(
                          lineItem.period_start,
                          lineItem.period_end
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
