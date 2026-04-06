"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
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
import type { Customer, StripeList } from "@/modules/customers/types";
import { CreateCustomerDialog } from "./create-customer-dialog";
import { DeleteCustomerDialog } from "./delete-customer-dialog";
import { EditCustomerDialog } from "./edit-customer-dialog";

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async (startingAfter?: string) => {
    const params = new URLSearchParams();
    if (startingAfter) params.set("starting_after", startingAfter);

    try {
      setError(null);
      const res = await fetch(`/api/customers?${params}`);

      if (!res.ok) {
        throw new Error(`Failed to load customers (${res.status})`);
      }

      const data: StripeList<Customer> = await res.json();

      if (startingAfter) {
        setCustomers((prev) => [...prev, ...data.data]);
      } else {
        setCustomers(data.data);
      }
      setHasMore(data.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
      if (!startingAfter) {
        setCustomers([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function refresh() {
    setLoading(true);
    setError(null);
    fetchCustomers();
  }

  function formatDate(unix: number) {
    return new Date(unix * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const filtered = search
    ? customers.filter(
        (c) =>
          c.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.email?.toLowerCase().includes(search.toLowerCase()) ||
          c.id.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the customers who purchase your products and services.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <CreateCustomerDialog onCreated={refresh} />
      </div>

      {/* Content */}
      {loading && customers.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading customers...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="text-center">
            <p className="font-medium">Could not load customers</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No customers yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first customer to get started.
            </p>
          </div>
          <CreateCustomerDialog onCreated={refresh} />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px]">Name</TableHead>
                <TableHead className="w-[240px]">Email</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="w-[120px] text-right">Created</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:underline"
                    >
                      {customer.name || customer.email || customer.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email || "--"}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {customer.id}
                    </code>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(customer.created)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditCustomerDialog customer={customer} onUpdated={refresh} />
                      <DeleteCustomerDialog customer={customer} onDeleted={refresh} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No customers match your search.
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
                onClick={() => fetchCustomers(customers[customers.length - 1].id)}
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
