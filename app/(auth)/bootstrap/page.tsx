import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  auth,
  bootstrapFirstAdmin,
  getServerPrincipal,
  hasAnyAuthUsers,
} from "@/infrastructure/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function bootstrapAction(formData: FormData) {
  "use server";

  if (await hasAnyAuthUsers()) {
    redirect("/sign-in");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || password.length < 12) {
    redirect("/bootstrap?error=invalid_input");
  }

  try {
    await bootstrapFirstAdmin({
      email,
      name,
      password,
    });
    await auth.api.signInEmail({
      headers: await headers(),
      body: {
        email,
        password,
      },
    });
  } catch {
    redirect("/bootstrap?error=bootstrap_failed");
  }

  redirect("/products");
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getServerPrincipal();
  if (principal) {
    redirect("/products");
  }

  if (await hasAnyAuthUsers()) {
    redirect("/sign-in");
  }

  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-primary">Bootstrap</p>
        <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Create the first admin</h1>
        <p className="text-sm text-muted-foreground">
          This screen is available only until the first user exists.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "invalid_input"
            ? "Name, email, and a 12-character password are required."
            : "Bootstrap failed."}
        </p>
      ) : null}

      <form action={bootstrapAction} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="name"
            name="name"
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
          />
        </div>
        <Button type="submit" className="w-full">
          Create admin
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already initialized?{" "}
        <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </p>
    </div>
  );
}
