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
import { Textarea } from "@/components/ui/textarea";

export function CreateCustomerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const externalId = ((formData.get("external_id") as string) || "").trim();
    const addressLine1 = ((formData.get("address_line1") as string) || "").trim();

    let address: Record<string, string> | undefined;
    if (addressLine1) {
      address = { line1: addressLine1 };
      const line2 = ((formData.get("address_line2") as string) || "").trim();
      const city = ((formData.get("address_city") as string) || "").trim();
      const state = ((formData.get("address_state") as string) || "").trim();
      const postalCode = ((formData.get("address_postal_code") as string) || "").trim();
      const country = ((formData.get("address_country") as string) || "").trim();
      if (line2) address.line2 = line2;
      if (city) address.city = city;
      if (state) address.state = state;
      if (postalCode) address.postal_code = postalCode;
      if (country) address.country = country;
    }

    const body = {
      name: (formData.get("name") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      address,
      metadata: externalId ? { external_id: externalId } : undefined,
    };

    const res = await fetch("/api/customers", {
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
        Add customer
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create customer</DialogTitle>
          <DialogDescription>
            Add a new customer. You can edit details later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Jane Smith"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="e.g. jane@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="A brief description of this customer"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="external_id">External ID</Label>
            <Input
              id="external_id"
              name="external_id"
              placeholder="e.g. crm_12345"
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Address</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address_line1">Line 1</Label>
              <Input
                id="address_line1"
                name="address_line1"
                placeholder="e.g. Av. Corrientes 1234"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address_line2">Line 2</Label>
              <Input
                id="address_line2"
                name="address_line2"
                placeholder="e.g. Piso 4, Depto B"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address_city">City</Label>
                <Input
                  id="address_city"
                  name="address_city"
                  placeholder="e.g. Buenos Aires"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address_state">State</Label>
                <Input
                  id="address_state"
                  name="address_state"
                  placeholder="e.g. CABA"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address_postal_code">Postal code</Label>
                <Input
                  id="address_postal_code"
                  name="address_postal_code"
                  placeholder="e.g. C1043"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address_country">Country</Label>
                <Input
                  id="address_country"
                  name="address_country"
                  placeholder="e.g. AR"
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Creating..." : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
