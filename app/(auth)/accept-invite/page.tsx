import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptInvite,
  auth,
  getServerPrincipal,
  getValidInviteByToken,
} from "@/infrastructure/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function acceptInviteAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!token || !name || password.length < 12) {
    redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=invalid_input`);
  }

  try {
    const invite = await acceptInvite({
      token,
      name,
      password,
    });

    await auth.api.signInEmail({
      headers: await headers(),
      body: {
        email: invite.email,
        password,
      },
    });
  } catch {
    redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=invalid_invite`);
  }

  redirect("/products");
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getServerPrincipal();
  if (principal) {
    redirect("/products");
  }

  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const error = typeof query.error === "string" ? query.error : null;
  const invite = token ? await getValidInviteByToken(token) : null;

  if (!invite) {
    return (
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-primary">Invite</p>
        <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This invite was revoked, already used, or expired.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-primary">Invite</p>
        <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Join Pentos</h1>
        <p className="text-sm text-muted-foreground">
          You are accepting an invitation for <strong>{invite.email}</strong>.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "invalid_input"
            ? "Name and a 12-character password are required."
            : "The invite could not be accepted."}
        </p>
      ) : null}

      <form action={acceptInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
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
          Accept invite
        </Button>
      </form>
    </div>
  );
}
