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
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/modules/customers/types";

export function EditCustomerDialog({
  customer,
  onUpdated,
}: {
  customer: Customer;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(customer.name ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [description, setDescription] = useState(customer.description ?? "");
  const [addressLine1, setAddressLine1] = useState(customer.address?.line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(customer.address?.line2 ?? "");
  const [addressCity, setAddressCity] = useState(customer.address?.city ?? "");
  const [addressState, setAddressState] = useState(customer.address?.state ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(customer.address?.postal_code ?? "");
  const [addressCountry, setAddressCountry] = useState(customer.address?.country ?? "");

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setName(customer.name ?? "");
      setEmail(customer.email ?? "");
      setDescription(customer.description ?? "");
      setAddressLine1(customer.address?.line1 ?? "");
      setAddressLine2(customer.address?.line2 ?? "");
      setAddressCity(customer.address?.city ?? "");
      setAddressState(customer.address?.state ?? "");
      setAddressPostalCode(customer.address?.postal_code ?? "");
      setAddressCountry(customer.address?.country ?? "");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const line1 = addressLine1.trim();
    let address: Record<string, string> | null | undefined;
    if (line1) {
      address = { line1 };
      if (addressLine2.trim()) address.line2 = addressLine2.trim();
      if (addressCity.trim()) address.city = addressCity.trim();
      if (addressState.trim()) address.state = addressState.trim();
      if (addressPostalCode.trim()) address.postal_code = addressPostalCode.trim();
      if (addressCountry.trim()) address.country = addressCountry.trim();
    } else if (customer.address) {
      address = null;
    }

    const body = {
      name: name || null,
      email: email || null,
      description: description || null,
      ...(address !== undefined && { address }),
    };

    const res = await fetch(`/api/customers/${customer.id}`, {
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

  const displayName = customer.name || customer.email || customer.id;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Update the details for{" "}
            <span className="font-medium text-foreground">{displayName}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this customer"
              rows={3}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Address</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-address-line1">Line 1</Label>
              <Input
                id="edit-address-line1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="e.g. Av. Corrientes 1234"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-address-line2">Line 2</Label>
              <Input
                id="edit-address-line2"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="e.g. Piso 4, Depto B"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address-city">City</Label>
                <Input
                  id="edit-address-city"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="e.g. Buenos Aires"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address-state">State</Label>
                <Input
                  id="edit-address-state"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  placeholder="e.g. CABA"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address-postal-code">Postal code</Label>
                <Input
                  id="edit-address-postal-code"
                  value={addressPostalCode}
                  onChange={(e) => setAddressPostalCode(e.target.value)}
                  placeholder="e.g. C1043"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address-country">Country</Label>
                <Input
                  id="edit-address-country"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
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
              {loading ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
