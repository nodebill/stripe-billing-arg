export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-[#f6f5f4]">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
        <div className="w-full rounded-xl border border-border bg-white p-8 shadow-[var(--shadow-card)]">
          {children}
        </div>
      </div>
    </main>
  );
}
