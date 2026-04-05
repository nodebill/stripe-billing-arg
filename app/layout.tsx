import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Activity, Package, Users } from "lucide-react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Havana",
  description: "Argentine billing system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
            <Link href="/" className="text-sm font-semibold">
              Havana
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
              href="/billing/meters"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Activity className="size-4" />
              Meters
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
