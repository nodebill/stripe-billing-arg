export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.10),_transparent_40%),linear-gradient(180deg,_#f8fafc,_#ffffff)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
        <div className="w-full rounded-2xl border bg-white/95 p-8 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
