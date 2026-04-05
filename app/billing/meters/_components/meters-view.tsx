"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MetersView() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMeters() {
      try {
        setError(null);
        const res = await fetch("/api/billing/meters?limit=100");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message ?? "Failed to load meters");
        }

        if (active) {
          const list = data as StripeMeterList;
          setMeters(list.data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load meters");
          setMeters([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMeters();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect active and inactive billing meters and drill into their recorded
          usage.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Loading meters...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="text-center">
            <p className="font-medium">Could not load meters</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      ) : meters.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Activity className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No meters yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a billing meter through the API to start recording usage.
            </p>
          </div>
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
                    {formatDate(meter.created)}
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
