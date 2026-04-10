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
import type {
  Customer,
  StripeList,
  StripeSearchResult,
} from "@/modules/customers/types";
import { formatUtcDate } from "@/lib/utc-format";
import { CreateCustomerDialog } from "./create-customer-dialog";
import { DeleteCustomerDialog } from "./delete-customer-dialog";
import { EditCustomerDialog } from "./edit-customer-dialog";
import { ImportCustomersDialog } from "./import-customers-dialog";
import { ImportSubscriptionsDialog } from "./import-subscriptions-dialog";

const SEARCH_LIMIT = 100;

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchNextPage, setSearchNextPage] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (startingAfter?: string) => {
    const params = new URLSearchParams();
    if (startingAfter) {
      params.set("starting_after", startingAfter);
    }

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
      if (data.total_count !== undefined) {
        setTotalCount(data.total_count);
      }
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

  const fetchSearchResults = useCallback(
    async ({
      query,
      page,
      append = false,
      signal,
    }: {
      query: string;
      page?: string;
      append?: boolean;
      signal?: AbortSignal;
    }) => {
      const params = new URLSearchParams({
        query,
        limit: String(SEARCH_LIMIT),
      });

      if (page) {
        params.set("page", page);
      }

      const res = await fetch(`/api/customers/search?${params}`, { signal });

      if (!res.ok) {
        throw new Error(`Failed to search customers (${res.status})`);
      }

      const data: StripeSearchResult<Customer> = await res.json();
      setSearchResults((current) =>
        append ? [...current, ...data.data] : data.data
      );
      setSearchHasMore(data.has_more);
      setSearchNextPage(data.next_page);
      setSearchError(null);
    },
    []
  );

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const trimmedSearch = search.trim();

    if (!trimmedSearch) {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchNextPage(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        await fetchSearchResults({
          query: trimmedSearch,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setSearchResults([]);
        setSearchHasMore(false);
        setSearchNextPage(null);
        setSearchError(
          err instanceof Error ? err.message : "Failed to search customers"
        );
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchSearchResults, search]);

  async function refresh() {
    setError(null);

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      try {
        setSearchLoading(true);
        await fetchSearchResults({ query: trimmedSearch });
      } catch (err) {
        setSearchResults([]);
        setSearchHasMore(false);
        setSearchNextPage(null);
        setSearchError(
          err instanceof Error ? err.message : "Failed to search customers"
        );
      } finally {
        setSearchLoading(false);
      }
      return;
    }

    setLoading(true);
    await fetchCustomers();
  }

  async function loadMoreSearch() {
    const trimmedSearch = search.trim();
    if (!trimmedSearch || !searchNextPage) {
      return;
    }

    try {
      setSearchLoading(true);
      await fetchSearchResults({
        query: trimmedSearch,
        page: searchNextPage,
        append: true,
      });
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to search customers"
      );
    } finally {
      setSearchLoading(false);
    }
  }

  const normalizedSearch = search.trim();
  const isSearchMode = normalizedSearch.length > 0;
  const visibleCustomers = isSearchMode ? searchResults : customers;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Customers{totalCount !== null && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({totalCount})
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the customers who purchase your products and services.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, ID, or external ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchLoading && isSearchMode
              ? "Searching customers in the backend..."
              : "Searches the backend by name, email, customer ID, or external ID."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportCustomersDialog onCreated={refresh} />
          <ImportSubscriptionsDialog onCreated={refresh} />
          <CreateCustomerDialog onCreated={refresh} />
        </div>
      </div>

      {!isSearchMode && loading && customers.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading customers...</p>
          </div>
        </div>
      ) : !isSearchMode && error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="text-center">
            <p className="font-medium">Could not load customers</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : !isSearchMode && customers.length === 0 ? (
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
          <div className="flex flex-wrap justify-center gap-2">
            <ImportCustomersDialog onCreated={refresh} />
            <CreateCustomerDialog onCreated={refresh} />
          </div>
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
              {visibleCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="hover:underline"
                      >
                        {customer.name || customer.email || customer.id}
                      </Link>
                      {customer.metadata.external_id && (
                        <span className="text-xs font-normal text-muted-foreground">
                          External ID: {customer.metadata.external_id}
                        </span>
                      )}
                    </div>
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
                    {formatUtcDate(customer.created)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditCustomerDialog customer={customer} onUpdated={refresh} />
                      <DeleteCustomerDialog customer={customer} onDeleted={refresh} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visibleCustomers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {searchLoading && isSearchMode
                      ? "Searching customers..."
                      : searchError
                        ? searchError
                        : "No customers match your search."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          {isSearchMode ? (
            searchHasMore ? (
              <div className="flex justify-center border-t px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={searchLoading}
                  onClick={() => void loadMoreSearch()}
                >
                  {searchLoading ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null
          ) : hasMore ? (
            <div className="flex justify-center border-t px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void fetchCustomers(customers[customers.length - 1].id)}
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
