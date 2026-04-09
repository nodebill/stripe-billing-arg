"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Customer, StripeList } from "@/modules/customers/types";
import type {
  MeterEventSummary,
  StripeMeterEventSummaryList,
} from "@/modules/meter-events/types";
import type { Meter } from "@/modules/meters/types";

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function defaultDateRange() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function toUnixDateStart(value: string) {
  return Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / 1000);
}

function toUnixDateExclusiveEnd(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return Math.floor(date.getTime() / 1000);
}

function customerLabel(customer: Customer) {
  if (customer.name && customer.email) {
    return `${customer.name} (${customer.email})`;
  }
  return customer.name || customer.email || customer.id;
}

function customerSortKey(customer: Customer) {
  return (customer.name || customer.email || customer.id).toLowerCase();
}

export function MeterDetailView({ meterId }: { meterId: string }) {
  const [meter, setMeter] = useState<Meter | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => defaultDateRange().start);
  const [endDate, setEndDate] = useState(() => defaultDateRange().end);
  const [dailySummaries, setDailySummaries] = useState<MeterEventSummary[]>([]);
  const [totalSummary, setTotalSummary] = useState<MeterEventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBaseData() {
      try {
        setError(null);

        const [meterRes, customersRes] = await Promise.all([
          fetch(`/api/billing/meters/${meterId}`),
          fetch("/api/customers?limit=100"),
        ]);

        const meterData = await meterRes.json();
        const customersData = await customersRes.json();

        if (!meterRes.ok) {
          throw new Error(meterData.error?.message ?? "Failed to load meter");
        }

        if (!customersRes.ok) {
          throw new Error(customersData.error?.message ?? "Failed to load customers");
        }

        if (!active) {
          return;
        }

        setMeter(meterData as Meter);
        const customerList = (customersData as StripeList<Customer>).data
          .slice()
          .sort((a, b) => customerSortKey(a).localeCompare(customerSortKey(b)));
        setCustomers(customerList);
        setSelectedCustomerId((current) => current || customerList[0]?.id || "");
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load meter");
          setMeter(null);
          setCustomers([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBaseData();

    return () => {
      active = false;
    };
  }, [meterId]);

  useEffect(() => {
    let active = true;

    async function loadSummaries() {
      if (!selectedCustomerId || !meter) {
        setDailySummaries([]);
        setTotalSummary(null);
        return;
      }

      try {
        setSummaryLoading(true);
        setSummaryError(null);

        const baseParams = new URLSearchParams({
          customer: selectedCustomerId,
          start_time: String(toUnixDateStart(startDate)),
          end_time: String(toUnixDateExclusiveEnd(endDate)),
        });

        const groupedParams = new URLSearchParams(baseParams);
        groupedParams.set("value_grouping_window", "day");

        const [groupedRes, totalRes] = await Promise.all([
          fetch(`/api/billing/meters/${meter.id}/event_summaries?${groupedParams}`),
          fetch(`/api/billing/meters/${meter.id}/event_summaries?${baseParams}`),
        ]);

        const groupedData = await groupedRes.json();
        const totalData = await totalRes.json();

        if (!groupedRes.ok) {
          throw new Error(groupedData.error?.message ?? "Failed to load usage");
        }

        if (!totalRes.ok) {
          throw new Error(totalData.error?.message ?? "Failed to load usage");
        }

        if (!active) {
          return;
        }

        setDailySummaries((groupedData as StripeMeterEventSummaryList).data);
        setTotalSummary((totalData as StripeMeterEventSummaryList).data[0] ?? null);
      } catch (err) {
        if (active) {
          setSummaryError(err instanceof Error ? err.message : "Failed to load usage");
          setDailySummaries([]);
          setTotalSummary(null);
        }
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    loadSummaries();

    return () => {
      active = false;
    };
  }, [endDate, meter, selectedCustomerId, startDate]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm">Loading meter...</p>
        </div>
      </div>
    );
  }

  if (!meter) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/billing/meters"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to meters
        </Link>
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-medium">Meter not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "This meter could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/billing/meters"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to meters
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {meter.display_name}
                </h1>
                <Badge variant={meter.status === "active" ? "outline" : "secondary"}>
                  {meter.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Track usage submitted under <code>{meter.event_name}</code>.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Meter ID
              </p>
              <code className="mt-2 block text-sm">{meter.id}</code>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Event name
              </p>
              <p className="mt-2 text-sm font-medium">{meter.event_name}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Aggregation
              </p>
              <p className="mt-2 text-sm font-medium capitalize">
                {meter.default_aggregation.formula}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Selected customer
              </p>
              <p className="mt-2 text-sm font-medium">
                {selectedCustomer?.email || selectedCustomer?.name || "None"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-6">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-medium">Usage summaries</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review daily usage buckets for a customer over a selected UTC date
              range.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Customer</span>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="h-8 w-full justify-between font-normal"
                    />
                  }
                >
                  <span className="truncate">
                    {selectedCustomer
                      ? customerLabel(selectedCustomer)
                      : "Select customer..."}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[--anchor-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name, email, or ID..." />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.name ?? ""} ${customer.email ?? ""} ${customer.id}`}
                            onSelect={() => {
                              setSelectedCustomerId(customer.id);
                              setCustomerPickerOpen(false);
                            }}
                            data-checked={customer.id === selectedCustomerId}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                customer.id === selectedCustomerId
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <span className="truncate">{customerLabel(customer)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Start date</span>
              <Input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">End date</span>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total usage in range
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {totalSummary?.aggregated_value ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Grouping window
              </p>
              <p className="mt-2 text-sm font-medium">Daily (UTC)</p>
            </div>
          </div>

          {summaryError ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {summaryError}
            </div>
          ) : null}

          {summaryLoading ? (
            <div className="flex items-center justify-center py-14">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <p className="text-sm">Loading usage...</p>
              </div>
            </div>
          ) : dailySummaries.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="size-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium">No usage recorded</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No meter events were found for the selected customer and date range.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Window start</TableHead>
                    <TableHead>Window end</TableHead>
                    <TableHead className="text-right">Aggregated usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySummaries.map((summary) => (
                    <TableRow key={summary.id}>
                      <TableCell>{formatDateLabel(new Date(summary.start_time * 1000).toISOString().slice(0, 10))}</TableCell>
                      <TableCell>{formatDateLabel(new Date((summary.end_time - 1) * 1000).toISOString().slice(0, 10))}</TableCell>
                      <TableCell className="text-right font-medium">
                        {summary.aggregated_value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
