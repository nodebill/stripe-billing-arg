"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
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
import type { Product, StripeList } from "@/modules/products/types";
import { formatUtcDate } from "@/lib/utc-format";
import { CreateProductDialog } from "./create-product-dialog";
import { DeleteProductDialog } from "./delete-product-dialog";
import { EditProductDialog } from "./edit-product-dialog";

export function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchProducts = useCallback(async (startingAfter?: string) => {
    const params = new URLSearchParams();
    if (startingAfter) params.set("starting_after", startingAfter);

    try {
      setError(null);
      const res = await fetch(`/api/products?${params}`);

      if (!res.ok) {
        throw new Error(`Failed to load products (${res.status})`);
      }

      const data: StripeList<Product> = await res.json();

      if (startingAfter) {
        setProducts((prev) => [...prev, ...data.data]);
      } else {
        setProducts(data.data);
      }
      setHasMore(data.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
      if (!startingAfter) {
        setProducts([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function refresh() {
    setLoading(true);
    setError(null);
    fetchProducts();
  }

  const filtered = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.id.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the products and services you offer to your customers.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <CreateProductDialog onCreated={refresh} />
      </div>

      {/* Content */}
      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading products...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="text-center">
            <p className="font-medium">Could not load products</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Package className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No products yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first product to get started.
            </p>
          </div>
          <CreateProductDialog onCreated={refresh} />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[280px]">Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px] text-right">Created</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/products/${product.id}`}
                      className="hover:underline"
                    >
                      {product.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {product.id}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={product.active ? "outline" : "secondary"}
                    >
                      <span
                        className={`mr-1 inline-block size-1.5 rounded-full ${
                          product.active ? "bg-emerald-500" : "bg-muted-foreground/50"
                        }`}
                      />
                      {product.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {product.description || "\u2014"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatUtcDate(product.created)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditProductDialog product={product} onUpdated={refresh} />
                      <DeleteProductDialog product={product} onDeleted={refresh} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No products match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center border-t px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchProducts(products[products.length - 1].id)}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
