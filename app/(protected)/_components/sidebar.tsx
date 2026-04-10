"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  KeyRound,
  Menu,
  Package,
  ReceiptText,
  Repeat,
  Shield,
  Users,
  X,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const mainLinks = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/billing/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/billing/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/billing/meters", label: "Meters", icon: Activity },
];

const adminLinks = [
  { href: "/team", label: "Team", icon: Shield },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
];

export function Sidebar({
  user,
  isAdmin,
  signOutAction,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <Link
          href="/"
          className="text-base font-bold tracking-[-0.25px]"
          onClick={() => setMobileOpen(false)}
        >
          Pentos
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {mainLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-[0.94rem] font-medium transition-colors ${
              isActive(href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <Separator className="my-2" />
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-[0.94rem] font-medium transition-colors ${
                  isActive(href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="mb-2 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground">{user.email}</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded border border-border px-3 py-1.5 text-sm hover:bg-sidebar-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded p-1 hover:bg-sidebar-accent"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <span className="ml-3 text-sm font-bold">Pentos</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-60 border-r border-sidebar-border bg-sidebar transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:z-auto`}
      >
        <div className="h-full pt-0 md:pt-0">{nav}</div>
      </aside>
    </>
  );
}
