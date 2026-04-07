import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
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
        <p className="text-sm uppercase tracking-[0.2em] text-sky-700">Pentos</p>
        <h1 className="text-2xl font-semibold">Sign in</h1>
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
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Sign in
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        First deployment?{" "}
        <Link href="/bootstrap" className="text-sky-700 underline-offset-4 hover:underline">
          Create the initial admin
        </Link>
      </p>
    </div>
  );
}
