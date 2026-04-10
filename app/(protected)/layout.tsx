import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getServerPrincipal } from "@/infrastructure/auth";
import { Sidebar } from "./_components/sidebar";

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
      <Sidebar
        user={{
          name: principal.user.name,
          email: principal.user.email,
        }}
        isAdmin={isAdmin}
        signOutAction={signOutAction}
      />
      <main className="min-h-screen pt-12 md:ml-60 md:pt-0">
        {children}
      </main>
    </div>
  );
}
