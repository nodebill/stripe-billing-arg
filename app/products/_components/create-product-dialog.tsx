"use client";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function CreateProductDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      active: formData.get("active") === "on",
    };

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Something went wrong");
      setLoading(false);
      return;
    }

    setLoading(false);
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" />}
      >
        <Plus data-icon="inline-start" />
        Add product
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create product</DialogTitle>
          <DialogDescription>
            Add a new product to your catalog. You can edit details later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Premium Plan"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="A brief description of this product"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Visible to customers at checkout and on invoices.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="active" className="text-sm font-medium">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Available for purchase
              </p>
            </div>
            <Switch id="active" name="active" defaultChecked />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Creating..." : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
