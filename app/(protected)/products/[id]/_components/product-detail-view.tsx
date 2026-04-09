"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CircleDollarSign } from "lucide-react";
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
import type { Meter } from "@/modules/meters/types";
import type { Price } from "@/modules/prices/types";
import type { Product } from "@/modules/products/types";
import type { StripeList } from "@/modules/shared/types";
import { formatUtcDate } from "@/lib/utc-format";
import { BulkCreatePricesDialog } from "./bulk-create-prices-dialog";
import { CreatePriceDialog } from "./create-price-dialog";
import { EditPriceDialog } from "./edit-price-dialog";
import { formatPriceAmount, formatPriceType } from "./price-format";

export function ProductDetailView({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    setError(null);

    try {
      const [productRes, pricesRes, metersRes] = await Promise.all([
        fetch(`/api/products/${productId}`),
        fetch(`/api/prices?${new URLSearchParams({ product: productId, limit: "100" })}`),
        fetch(
          `/api/billing/meters?${new URLSearchParams({
            limit: "100",
            status: "active",
          })}`
        ),
      ]);

      if (!productRes.ok) {
        const data = await productRes.json();
        throw new Error(data.error?.message ?? "Failed to load product");
      }

      if (!pricesRes.ok) {
        const data = await pricesRes.json();
        throw new Error(data.error?.message ?? "Failed to load prices");
      }

      if (!metersRes.ok) {
        const data = await metersRes.json();
        throw new Error(data.error?.message ?? "Failed to load meters");
      }

      const productData: Product = await productRes.json();
      const pricesData: StripeList<Price> = await pricesRes.json();
      const metersData: StripeList<Meter> = await metersRes.json();

      setProduct(productData);
      setPrices(pricesData.data);
      setMeters(metersData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
      setProduct(null);
      setPrices([]);
      setMeters([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  function refresh() {
    setLoading(true);
    fetchProduct();
  }

  async function handleMeterCreated(meter: Meter) {
    setMeters((current) => [
      meter,
      ...current.filter((existing) => existing.id !== meter.id),
    ]);
  }

  async function handleSetDefault(priceId: string) {
    if (!product) return;

    setSettingDefaultId(priceId);

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_price: priceId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to update default price");
      }

      await fetchProduct();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update default price"
      );
    } finally {
      setSettingDefaultId(null);
    }
  }

  if (loading && !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to products
        </Link>
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-medium">Product not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "This product could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  const defaultPrice = prices.find((price) => price.id === product.default_price);
  const meterOptions = meters.map((meter) => ({
    id: meter.id,
    label: `${meter.display_name} • ${meter.event_name}`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to products
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {product.name}
                </h1>
                <Badge variant={product.active ? "outline" : "secondary"}>
                  {product.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {product.description || "No product description yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BulkCreatePricesDialog
                productId={product.id}
                meterOptions={meterOptions}
                onCreated={refresh}
              />
              <CreatePriceDialog
                productId={product.id}
                meterOptions={meterOptions}
                onMeterCreated={handleMeterCreated}
                onCreated={refresh}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Product ID
              </p>
              <code className="mt-2 block text-sm">{product.id}</code>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Default price
              </p>
              <p className="mt-2 text-sm font-medium">
                {defaultPrice
                  ? `${formatPriceAmount(
                      defaultPrice.unit_amount_decimal,
                      defaultPrice.currency
                    )} ${formatPriceType(defaultPrice)}`
                  : "No default price"}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Created
              </p>
              <p className="mt-2 text-sm font-medium">
                {formatUtcDate(product.created)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {prices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CircleDollarSign className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No prices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first price for this product.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <BulkCreatePricesDialog
              productId={product.id}
              meterOptions={meterOptions}
              onCreated={refresh}
            />
            <CreatePriceDialog
              productId={product.id}
              meterOptions={meterOptions}
              onMeterCreated={handleMeterCreated}
              onCreated={refresh}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Label</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.map((price) => {
                const isDefault = product.default_price === price.id;

                return (
                  <TableRow key={price.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {price.nickname || "Untitled price"}
                        </span>
                        <code className="text-xs text-muted-foreground">
                          {price.id}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatPriceAmount(
                        price.unit_amount_decimal,
                        price.currency
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatPriceType(price)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={price.active ? "outline" : "secondary"}>
                        {price.active ? "Active" : "Archived"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isDefault ? (
                        <Badge>Default</Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatUtcDate(price.created)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!isDefault && price.active && (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={settingDefaultId === price.id}
                            onClick={() => handleSetDefault(price.id)}
                          >
                            {settingDefaultId === price.id
                              ? "Saving..."
                              : "Set default"}
                          </Button>
                        )}
                        <EditPriceDialog price={price} onUpdated={refresh} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!product.active && (
        <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          This product is archived. Its prices remain visible for reference but
          cannot be used for new purchases.
        </div>
      )}
    </div>
  );
}
