import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  KeyRound,
  Package,
  ReceiptText,
  Repeat,
  Shield,
  Users,
} from "lucide-react";
import { auth, getServerPrincipal } from "@/infrastructure/auth";

async function signOutAction() {
  "use server";

  await auth.api.signOut({
    headers: await headers(),
  });

  redirect("/sign-in");
}

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const principal = await getServerPrincipal();
  if (!principal) {
    redirect("/sign-in");
  }

  const isAdmin = principal.user.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-sm font-semibold">
            Pentos
          </Link>
          <Link
            href="/products"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Package className="size-4" />
            Products
          </Link>
          <Link
            href="/customers"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Users className="size-4" />
            Customers
          </Link>
          <Link
            href="/billing/subscriptions"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Repeat className="size-4" />
            Subscriptions
          </Link>
          <Link
            href="/billing/invoices"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ReceiptText className="size-4" />
            Invoices
          </Link>
          <Link
            href="/billing/meters"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Activity className="size-4" />
            Meters
          </Link>
          {isAdmin ? (
            <>
              <Link
                href="/team"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Shield className="size-4" />
                Team
              </Link>
              <Link
                href="/api-keys"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="size-4" />
                API Keys
              </Link>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="font-medium">{principal.user.name}</div>
              <div className="text-muted-foreground">{principal.user.email}</div>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
