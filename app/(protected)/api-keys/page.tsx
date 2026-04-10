import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createMachineApiKey,
  deleteMachineApiKey,
  listMachineApiKeys,
  requireServerAdmin,
} from "@/infrastructure/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUtcDateTime } from "@/lib/utc-format";

async function createApiKeyAction(formData: FormData) {
  "use server";

  const principal = await requireServerAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return;
  }

  const created = await createMachineApiKey({
    userId: principal.user.id,
    name,
    headers: await headers(),
  });

  revalidatePath("/api-keys");
  redirect(`/api-keys?created=${encodeURIComponent(created.key)}`);
}

async function deleteApiKeyAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const keyId = String(formData.get("keyId") ?? "");
  if (!keyId) {
    return;
  }

  await deleteMachineApiKey({
    keyId,
    headers: await headers(),
  });

  revalidatePath("/api-keys");
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireServerAdmin();
  const keys = await listMachineApiKeys();
  const query = await searchParams;
  const createdKey = typeof query.created === "string" ? query.created : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <section className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Machine keys authenticate server-to-server requests with `x-api-key`.
          </p>
        </div>
        <form action={createApiKeyAction} className="flex max-w-xl gap-3 rounded-xl border p-4">
          <Input
            name="name"
            required
            placeholder="Billing processor"
            className="flex-1"
          />
          <Button type="submit">
            Create key
          </Button>
        </form>
        {createdKey ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Copy this key now. It is only shown once: {createdKey}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Existing keys</h2>
        <div className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No machine keys yet.</p>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <div className="font-medium">{key.name ?? "Unnamed key"}</div>
                  <div className="text-sm text-muted-foreground">
                    {key.start ?? key.prefix ?? key.id} · created{" "}
                    {formatUtcDateTime(key.createdAt)}
                  </div>
                </div>
                <form action={deleteApiKeyAction}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
