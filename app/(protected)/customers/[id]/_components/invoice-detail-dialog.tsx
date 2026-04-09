"use client";

import { useEffect, useState } from "react";
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
import { formatPriceAmount } from "@/app/(protected)/products/[id]/_components/price-format";
import type { Invoice, InvoiceDetail } from "@/modules/invoices/types";

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      <DialogContent>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <p className="font-medium">Invoice period</p>
                <p className="mt-1 text-muted-foreground">
                  {formatDate(detail.period_start)} to {formatDate(detail.period_end)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                <p className="font-medium">Amount due</p>
                <p className="mt-1 text-muted-foreground">
                  {formatPriceAmount(String(detail.amount_due), detail.currency)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border">
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
                        {formatDate(lineItem.period_start)} to{" "}
                        {formatDate(lineItem.period_end)}
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
