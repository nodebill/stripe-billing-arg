"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight } from "lucide-react";
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
import type { Meter, StripeMeterList } from "@/modules/meters/types";
import { formatUtcDate } from "@/lib/utc-format";
import { CreateMeterDialog } from "./create-meter-dialog";

export function MetersView() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMeters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/meters?limit=100");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message ?? "Failed to load meters");
      }

      const list = data as StripeMeterList;
      setMeters(list.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meters");
      setMeters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  async function handleMeterCreated(meter: Meter) {
    setError(null);
    setMeters((current) => [
      meter,
      ...current.filter((existing) => existing.id !== meter.id),
    ]);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Meters</h1>
          <p className="mt-1 text-base text-[#615d59]">
            Inspect active and inactive billing meters and drill into their
            recorded usage.
          </p>
        </div>
        <CreateMeterDialog onCreated={handleMeterCreated} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading meters...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border py-16">
          <div className="text-center">
            <p className="font-medium">Could not load meters</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void loadMeters()}>
            Retry
          </Button>
        </div>
      ) : meters.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Activity className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No meters yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first billing meter to start recording usage.
            </p>
          </div>
          <CreateMeterDialog onCreated={handleMeterCreated} />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Meter</TableHead>
                <TableHead>Event name</TableHead>
                <TableHead>Aggregation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[110px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {meters.map((meter) => (
                <TableRow key={meter.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{meter.display_name}</span>
                      <code className="text-xs text-muted-foreground">{meter.id}</code>
                    </div>
                  </TableCell>
                  <TableCell>{meter.event_name}</TableCell>
                  <TableCell className="capitalize">
                    {meter.default_aggregation.formula}
                  </TableCell>
                  <TableCell>
                    <Badge variant={meter.status === "active" ? "outline" : "secondary"}>
                      {meter.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatUtcDate(meter.created)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/billing/meters/${meter.id}`}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      View usage
                      <ArrowRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
