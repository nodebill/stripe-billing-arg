import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth, getServerPrincipal } from "@/infrastructure/auth";

async function signInAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/sign-in?error=missing_credentials");
  }

  try {
    await auth.api.signInEmail({
      headers: await headers(),
      body: {
        email,
        password,
      },
    });
  } catch {
    redirect("/sign-in?error=invalid_credentials");
  }

  redirect("/products");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getServerPrincipal();
  if (principal) {
    redirect("/products");
  }

  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-primary">Pentos</p>
        <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          The console and API are private. Use your personal credentials to enter.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "missing_credentials"
            ? "Email and password are required."
            : "Invalid credentials."}
        </p>
      ) : null}

      <form action={signInAction} className="space-y-4">
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
          Sign in
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        First deployment?{" "}
        <Link href="/bootstrap" className="text-primary underline-offset-4 hover:underline">
          Create the initial admin
        </Link>
      </p>
    </div>
  );
}
