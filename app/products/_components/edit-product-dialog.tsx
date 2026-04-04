"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
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
import type { Product } from "@/modules/products/types";

export function EditProductDialog({
  product,
  onUpdated,
}: {
  product: Product;
  onUpdated: () => void;
}) {
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
      description: (formData.get("description") as string) || null,
      active: formData.get("active") === "on",
    };

    const res = await fetch(`/api/products/${product.id}`, {
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
    onUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>
            Update the details for{" "}
            <span className="font-medium text-foreground">{product.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              name="name"
              required
              defaultValue={product.name}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={product.description ?? ""}
              placeholder="A brief description of this product"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label htmlFor="edit-active" className="text-sm font-medium">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Available for purchase
              </p>
            </div>
            <Switch
              id="edit-active"
              name="active"
              defaultChecked={product.active}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
