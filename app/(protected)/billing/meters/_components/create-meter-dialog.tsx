"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Meter } from "@/modules/meters/types";

export function CreateMeterDialog({
  onCreated,
  trigger,
}: {
  onCreated: (meter: Meter) => void | Promise<void>;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      display_name: String(formData.get("display_name") ?? "").trim(),
      event_name: String(formData.get("event_name") ?? "").trim(),
      default_aggregation: {
        formula: formData.get("default_aggregation.formula"),
      },
    };

    const res = await fetch("/api/billing/meters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? "Something went wrong");
      setLoading(false);
      return;
    }

    await onCreated(data as Meter);
    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" type="button">
              <Plus data-icon="inline-start" />
              Add meter
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create meter</DialogTitle>
          <DialogDescription>
            Define what usage to measure before attaching it to a metered price.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              required
              autoFocus
              placeholder="Processed Volume"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event_name">Event name</Label>
            <Input
              id="event_name"
              name="event_name"
              required
              placeholder="processed_volume"
            />
            <p className="text-xs text-muted-foreground">
              Use lowercase letters, numbers, and underscores only.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="default_aggregation.formula">Aggregation</Label>
            <select
              id="default_aggregation.formula"
              name="default_aggregation.formula"
              defaultValue="sum"
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="sum">Sum</option>
              <option value="count">Count</option>
            </select>
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Creating..." : "Create meter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
