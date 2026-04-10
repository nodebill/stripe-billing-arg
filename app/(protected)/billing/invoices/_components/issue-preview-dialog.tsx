"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatUtcDateTime } from "@/lib/utc-format";
import type { InvoiceIssuePreviewResult } from "@/modules/invoices/types";

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function IssuePreviewDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: InvoiceIssuePreviewResult | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="5xl">
        <DialogHeader>
          <DialogTitle>Issue preview</DialogTitle>
          <DialogDescription>
            Review the AFIP and PDF payloads before emitting the selected invoices.
          </DialogDescription>
        </DialogHeader>

        {!result ? null : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              {result.previewed_invoices} previewed, {result.failed_invoices} failed.
            </div>

            {result.results.map((item) =>
              item.status === "failed" ? (
                <div
                  key={item.invoice_id}
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{item.invoice_id}</p>
                  <p className="mt-1 text-destructive">{item.message}</p>
                </div>
              ) : item.preview ? (
                <div key={item.invoice_id} className="rounded-lg border">
                  <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{item.preview.invoice_id}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.preview.receiver_name} • {item.preview.receiver_tax_id}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.preview.receiver_tax_condition} • {item.preview.invoice_type}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        Estimated #{item.preview.estimated_invoice_number}
                      </Badge>
                      <Badge variant="outline">
                        {item.preview.expected_payment_status}
                      </Badge>
                      {item.preview.due_date ? (
                        <Badge variant="outline">
                          Due {formatUtcDateTime(item.preview.due_date)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {item.preview.warnings.length > 0 ? (
                    <div className="border-b bg-amber-50/60 px-4 py-3 text-sm">
                      {item.preview.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">AFIP request</p>
                      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        {formatJson(item.preview.payloads.afip_request)}
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">PDF request</p>
                      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        {formatJson(item.preview.payloads.pdf_request)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
