"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Customer } from "@/modules/customers/types";
import type { PaymentMethod } from "@/modules/payment-methods/types";
import type { StripeList } from "@/modules/shared/types";
import { CreatePaymentMethodDialog } from "./create-payment-method-dialog";
import { DetachPaymentMethodDialog } from "./detach-payment-method-dialog";
import { EditPaymentMethodDialog } from "./edit-payment-method-dialog";

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    setError(null);

    try {
      const [customerRes, paymentMethodsRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`),
        fetch(
          `/api/customers/${customerId}/payment_methods?${new URLSearchParams({
            limit: "100",
          })}`
        ),
      ]);

      if (!customerRes.ok) {
        const data = await customerRes.json();
        throw new Error(data.error?.message ?? "Failed to load customer");
      }

      if (!paymentMethodsRes.ok) {
        const data = await paymentMethodsRes.json();
        throw new Error(data.error?.message ?? "Failed to load payment methods");
      }

      const customerData: Customer = await customerRes.json();
      const paymentMethodsData: StripeList<PaymentMethod> =
        await paymentMethodsRes.json();

      setCustomer(customerData);
      setPaymentMethods(paymentMethodsData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
      setCustomer(null);
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  function refresh() {
    setLoading(true);
    fetchCustomer();
  }

  if (loading && !customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm">Loading customer...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to customers
        </Link>
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-medium">Customer not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "This customer could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to customers
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {customer.name || customer.email || customer.id}
                </h1>
                <Badge variant="outline">Customer</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {customer.description || "No customer description yet."}
              </p>
            </div>
            <CreatePaymentMethodDialog customerId={customer.id} onCreated={refresh} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Customer ID
              </p>
              <code className="mt-2 block text-sm">{customer.id}</code>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </p>
              <p className="mt-2 text-sm font-medium">
                {customer.email || "No email"}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Created
              </p>
              <p className="mt-2 text-sm font-medium">
                {formatDate(customer.created)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {paymentMethods.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <WalletCards className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No payment methods yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the first custom payment method for this customer.
            </p>
          </div>
          <CreatePaymentMethodDialog customerId={customer.id} onCreated={refresh} />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>Billing name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="w-[96px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentMethods.map((paymentMethod) => (
                <TableRow key={paymentMethod.id}>
                  <TableCell>
                    <Badge variant="secondary">Custom</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {paymentMethod.billing_details.name || "--"}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {paymentMethod.id}
                    </code>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(paymentMethod.created)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditPaymentMethodDialog
                        paymentMethod={paymentMethod}
                        onUpdated={refresh}
                      />
                      <DetachPaymentMethodDialog
                        paymentMethod={paymentMethod}
                        onDetached={refresh}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Detached payment methods stay in history and cannot be re-attached.
      </div>
    </div>
  );
}
