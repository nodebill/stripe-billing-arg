"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ReceiptText, Repeat, WalletCards } from "lucide-react";
import {
  formatPriceAmount,
  formatPriceType,
} from "@/app/(protected)/products/[id]/_components/price-format";
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
import type { Invoice } from "@/modules/invoices/types";
import type { PaymentMethod } from "@/modules/payment-methods/types";
import type { Price } from "@/modules/prices/types";
import type { Product } from "@/modules/products/types";
import type { StripeList } from "@/modules/shared/types";
import type { Subscription } from "@/modules/subscriptions/types";
import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";
import { CreatePaymentMethodDialog } from "./create-payment-method-dialog";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { DetachPaymentMethodDialog } from "./detach-payment-method-dialog";
import { EditPaymentMethodDialog } from "./edit-payment-method-dialog";
import { ScheduleSubscriptionDialog } from "./schedule-subscription-dialog";

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCollectionMethodLabel(
  collectionMethod: "charge_automatically" | "send_invoice"
) {
  return collectionMethod === "charge_automatically"
    ? "Auto-charge"
    : "Send invoice";
}

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    setError(null);

    try {
      const [
        customerRes,
        paymentMethodsRes,
        productsRes,
        subscriptionsRes,
        invoicesRes,
      ] =
        await Promise.all([
          fetch(`/api/customers/${customerId}`),
          fetch(
            `/api/customers/${customerId}/payment_methods?${new URLSearchParams({
              limit: "100",
            })}`
          ),
          fetch(`/api/products?${new URLSearchParams({ limit: "100" })}`),
          fetch(
            `/api/subscriptions?${new URLSearchParams({
              customer: customerId,
              limit: "100",
            })}`
          ),
          fetch(
            `/api/invoices?${new URLSearchParams({
              customer: customerId,
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

      if (!productsRes.ok) {
        const data = await productsRes.json();
        throw new Error(data.error?.message ?? "Failed to load products");
      }

      if (!subscriptionsRes.ok) {
        const data = await subscriptionsRes.json();
        throw new Error(data.error?.message ?? "Failed to load subscriptions");
      }

      if (!invoicesRes.ok) {
        const data = await invoicesRes.json();
        throw new Error(data.error?.message ?? "Failed to load invoices");
      }

      const customerData: Customer = await customerRes.json();
      const paymentMethodsData: StripeList<PaymentMethod> =
        await paymentMethodsRes.json();
      const productsData: StripeList<Product> = await productsRes.json();
      const subscriptionsData: StripeList<Subscription> =
        await subscriptionsRes.json();
      const invoicesData: StripeList<Invoice> = await invoicesRes.json();

      const priceLists = await Promise.all(
        productsData.data.map(async (product) => {
          const res = await fetch(
            `/api/prices?${new URLSearchParams({
              product: product.id,
              type: "recurring",
              limit: "100",
            })}`
          );

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error?.message ?? "Failed to load prices");
          }

          return data as StripeList<Price>;
        })
      );

      const priceData = priceLists.flatMap((list) => list.data);

      setCustomer(customerData);
      setPaymentMethods(paymentMethodsData.data);
      setSubscriptions(subscriptionsData.data);
      setInvoices(invoicesData.data);
      setProducts(productsData.data);
      setPrices(priceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
      setCustomer(null);
      setPaymentMethods([]);
      setSubscriptions([]);
      setInvoices([]);
      setProducts([]);
      setPrices([]);
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

  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const priceById = new Map(prices.map((price) => [price.id, price]));
  const activeRecurringPriceOptions = prices
    .filter((price) => price.active && price.recurring)
    .map((price) => {
      const productName = productNameById.get(price.product) ?? price.product;
      const label = `${productName} • ${
        price.nickname ||
        formatPriceAmount(price.unit_amount_decimal, price.currency)
      } • ${formatPriceType(price)}`;

      return {
        id: price.id,
        label,
      };
    });
  const paymentMethodOptions = paymentMethods.map((paymentMethod) => ({
    id: paymentMethod.id,
    label: paymentMethod.billing_details.name
      ? `${paymentMethod.billing_details.name} • ${paymentMethod.id}`
      : paymentMethod.id,
  }));

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

      {subscriptions.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Repeat className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No subscriptions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create the first recurring subscription for this customer.
            </p>
          </div>
          <CreateSubscriptionDialog
            customerId={customer.id}
            paymentMethodOptions={paymentMethodOptions}
            priceOptions={activeRecurringPriceOptions}
            onCreated={refresh}
          />
          {activeRecurringPriceOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create an active recurring price before creating a subscription.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="font-medium">Subscriptions</h2>
              <p className="text-sm text-muted-foreground">
                Manage recurring billing for this customer.
              </p>
            </div>
            <CreateSubscriptionDialog
              customerId={customer.id}
              paymentMethodOptions={paymentMethodOptions}
              priceOptions={activeRecurringPriceOptions}
              onCreated={refresh}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Payment method</TableHead>
                <TableHead>Period end</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => {
                const price = priceById.get(subscription.items[0]?.price);
                const productName = price
                  ? productNameById.get(price.product) ?? price.product
                  : "Unknown product";
                const priceLabel = price
                  ? `${productName} • ${
                      price.nickname ||
                      formatPriceAmount(price.unit_amount_decimal, price.currency)
                    } • ${formatPriceType(price)}`
                  : subscription.items[0]?.price ?? "Unknown price";

                return (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">{priceLabel}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            subscription.status === "active"
                              ? "outline"
                              : "secondary"
                          }
                        >
                          {subscription.status === "active"
                            ? "Active"
                            : subscription.status === "past_due"
                              ? "Past due"
                              : "Canceled"}
                        </Badge>
                        {subscription.cancel_at_period_end ? (
                          <Badge variant="secondary">Ends at period end</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCollectionMethodLabel(subscription.collection_method)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {subscription.default_payment_method ?? "--"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(subscription.current_period_end)}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {subscription.id}
                      </code>
                    </TableCell>
                    <TableCell>
                      {subscription.status === "active" ? (
                        <div className="flex items-center justify-end gap-1">
                          <ScheduleSubscriptionDialog
                            subscription={subscription}
                            onUpdated={refresh}
                          />
                          <CancelSubscriptionDialog
                            subscription={subscription}
                            onCanceled={refresh}
                          />
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ReceiptText className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Renewal runs will create and track invoices here.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Invoices</h2>
            <p className="text-sm text-muted-foreground">
              Review renewal invoices and mocked delivery history.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Delivery</TableHead>
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
                    <Badge
                      variant={
                        invoice.status === "paid" || invoice.status === "open"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {invoice.status === "past_due"
                        ? "Past due"
                        : invoice.status === "open"
                          ? "Open"
                          : invoice.status === "paid"
                            ? "Paid"
                            : "Draft"}
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
                      ? `Paid ${formatDate(invoice.paid_at)}`
                      : invoice.due_date
                        ? `Due ${formatDate(invoice.due_date)}`
                        : invoice.finalized_at
                          ? `Finalized ${formatDate(invoice.finalized_at)}`
                          : `Created ${formatDate(invoice.created)}`}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
        Detached payment methods stay in history and cannot be re-attached. If a
        detached payment method is the default for an active subscription, that
        subscription is canceled immediately.
      </div>
    </div>
  );
}
