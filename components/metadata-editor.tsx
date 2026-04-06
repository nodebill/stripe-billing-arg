"use client";

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { key: string; value: string };

function toRows(record: Record<string, string>): Row[] {
  const entries = Object.entries(record);
  return entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : [];
}

function toRecord(rows: Row[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) {
      record[key] = row.value;
    }
  }
  return record;
}

export function MetadataEditor({
  defaultValue,
  onChange,
}: {
  defaultValue?: Record<string, string>;
  onChange: (metadata: Record<string, string>) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultValue ?? {}));

  const update = useCallback(
    (nextRows: Row[]) => {
      setRows(nextRows);
      onChange(toRecord(nextRows));
    },
    [onChange],
  );

  function handleChange(index: number, field: "key" | "value", val: string) {
    const next = rows.map((row, i) =>
      i === index ? { ...row, [field]: val } : row,
    );
    update(next);
  }

  function handleAdd() {
    update([...rows, { key: "", value: "" }]);
  }

  function handleRemove(index: number) {
    update(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Metadata</Label>
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="Key"
                value={row.key}
                onChange={(e) => handleChange(index, "key", e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value"
                value={row.value}
                onChange={(e) => handleChange(index, "value", e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => handleRemove(index)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={handleAdd}
        className="self-start"
      >
        <Plus data-icon="inline-start" />
        Add field
      </Button>
    </div>
  );
}
