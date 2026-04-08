"use client";

import { useEffect, useState } from "react";
import { Copy, FileSpreadsheet } from "lucide-react";
import {
  CUSTOMER_IMPORT_EXAMPLE_CSV,
  CUSTOMER_IMPORT_STANDARD_HEADERS,
} from "@/modules/customers/import-contract";
import type { CustomerImportResult } from "@/modules/customers/types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const columnDefinitions = [
  { header: "name", required: "Optional", notes: "Customer display name." },
  { header: "email", required: "Optional", notes: "Must be a valid email when present." },
  { header: "description", required: "Optional", notes: "Internal description for the customer." },
  { header: "external_id", required: "Optional", notes: "Stored as `metadata.external_id`." },
  { header: "address_line1", required: "Address only", notes: "Required when any address field is present." },
  { header: "address_line2", required: "Optional", notes: "Additional address information." },
  { header: "address_city", required: "Optional", notes: "City or locality." },
  { header: "address_state", required: "Optional", notes: "State or province." },
  { header: "address_postal_code", required: "Optional", notes: "Postal or ZIP code." },
  { header: "address_country", required: "Optional", notes: "Two-letter or internal country code." },
] as const;

export function ImportCustomersDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      setError(null);
      setResult(null);
      setSelectedFile(null);
      setCopied(false);
    }
  }

  async function handleCopyExample() {
    await navigator.clipboard.writeText(CUSTOMER_IMPORT_EXAMPLE_CSV);
    setCopied(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Choose one CSV file before uploading");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    const response = await fetch("/api/customers/import", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error?.message ?? "Failed to import customers");
      setLoading(false);
      return;
    }

    const nextResult = data as CustomerImportResult;
    setResult(nextResult);
    onCreated();
    setLoading(false);

    if (nextResult.failed_count === 0) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileSpreadsheet data-icon="inline-start" />
        Import customers
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import customers</DialogTitle>
          <DialogDescription>
            Upload one CSV to create many customers. Successful rows are kept
            even if other rows fail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 rounded-xl border">
              <div className="border-b px-4 py-3">
                <p className="font-medium">Expected CSV structure</p>
                <p className="text-sm text-muted-foreground">
                  Use the fixed header set below. This import is create-only.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="whitespace-normal">Column</TableHead>
                    <TableHead className="whitespace-normal">When required</TableHead>
                    <TableHead className="whitespace-normal">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnDefinitions.map((column) => (
                    <TableRow key={column.header}>
                      <TableCell className="align-top font-medium whitespace-normal break-words">
                        {column.header}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        {column.required}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal break-words text-muted-foreground">
                        {column.notes}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="min-w-0 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Example CSV</p>
                  <p className="text-sm text-muted-foreground">
                    Start from this exact header row.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleCopyExample}
                >
                  <Copy data-icon="inline-start" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border bg-muted/30 p-3">
                <pre className="min-w-max font-mono text-xs leading-6 whitespace-pre">
                  {CUSTOMER_IMPORT_EXAMPLE_CSV}
                </pre>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Required headers: {CUSTOMER_IMPORT_STANDARD_HEADERS.join(", ")}.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-import-file">CSV file</Label>
            <Input
              id="customer-import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={loading}
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total rows
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{result.total_rows}</p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Created
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{result.created_count}</p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Failed
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{result.failed_count}</p>
                </div>
              </div>

              {result.errors.length > 0 ? (
                <div className="rounded-xl border">
                  <div className="border-b px-4 py-3">
                    <p className="font-medium">Row errors</p>
                    <p className="text-sm text-muted-foreground">
                      Fix these CSV lines and upload again. Successful rows were
                      already created.
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-24">Line</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((rowError) => (
                        <TableRow key={`${rowError.row}-${rowError.message}`}>
                          <TableCell className="font-medium">{rowError.row}</TableCell>
                          <TableCell className="whitespace-normal text-muted-foreground">
                            {rowError.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Importing..." : "Import customers"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
