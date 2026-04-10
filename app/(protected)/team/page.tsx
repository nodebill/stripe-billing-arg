import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  auth,
  createTeamInvite,
  listPendingInvites,
  listTeamMembers,
  requireServerAdmin,
  revokeTeamInvite,
} from "@/infrastructure/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUtcDateTime } from "@/lib/utc-format";

const APP_BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

async function createInviteAction(formData: FormData) {
  "use server";

  const principal = await requireServerAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = formData.get("role") === "admin" ? "admin" : "user";

  if (!email) {
    return;
  }

  const result = await createTeamInvite({
    email,
    role,
    createdByUserId: principal.user.id,
    baseURL: APP_BASE_URL,
  });

  revalidatePath("/team");
  redirect(`/team?invite=${encodeURIComponent(result.url)}`);
}

async function revokeInviteAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) {
    return;
  }

  await revokeTeamInvite(inviteId);
  revalidatePath("/team");
}

async function setRoleAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "user";
  if (!userId) {
    return;
  }

  await auth.api.setRole({
    headers: await headers(),
    body: {
      userId,
      role,
    },
  });
  revalidatePath("/team");
}

async function banUserAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) {
    return;
  }

  await auth.api.banUser({
    headers: await headers(),
    body: {
      userId,
      banReason: "Disabled by an admin",
    },
  });
  revalidatePath("/team");
}

async function unbanUserAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) {
    return;
  }

  await auth.api.unbanUser({
    headers: await headers(),
    body: {
      userId,
    },
  });
  revalidatePath("/team");
}

async function setPasswordAction(formData: FormData) {
  "use server";

  await requireServerAdmin();
  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!userId || newPassword.length < 12) {
    return;
  }

  await auth.api.setUserPassword({
    headers: await headers(),
    body: {
      userId,
      newPassword,
    },
  });
  revalidatePath("/team");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireServerAdmin();
  const members = await listTeamMembers();
  const invites = await listPendingInvites();
  const query = await searchParams;
  const inviteLink = typeof query.invite === "string" ? query.invite : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <section className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-[1.63rem] font-bold leading-[1.23] tracking-[-0.625px]">Team</h1>
        </div>

        <form action={createInviteAction} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_140px_140px]">
          <Input
            name="email"
            type="email"
            required
            placeholder="teammate@example.com"
          />
          <select name="role" defaultValue="user" className="rounded-md border px-3 py-2">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit">
            Create invite
          </Button>
        </form>
        {inviteLink ? (
          <p className="rounded-md border border-border bg-[#f2f9ff] px-3 py-2 text-sm text-primary">
            Share this invite link: {inviteLink}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{member.name}</div>
                  <div className="text-sm text-muted-foreground">{member.email}</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {member.role ?? "user"}
                  {member.banned ? " • banned" : ""}
                  {member.id === principal.user.id ? " • you" : ""}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={setRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={member.id} />
                  <select
                    name="role"
                    defaultValue={member.role ?? "user"}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Save role
                  </Button>
                </form>
                {member.banned ? (
                  <form action={unbanUserAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Unban
                    </Button>
                  </form>
                ) : (
                  <form action={banUserAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Ban
                    </Button>
                  </form>
                )}
                <form action={setPasswordAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={member.id} />
                  <Input
                    name="newPassword"
                    type="password"
                    minLength={12}
                    placeholder="Temporary password"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Set password
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending invites</h2>
        <div className="space-y-3">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active invites.</p>
          ) : (
            invites.map((invite) => (
              <div key={invite.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{invite.email}</div>
                    <div className="text-sm text-muted-foreground">
                      {invite.role} · expires {formatUtcDateTime(invite.expiresAt)}
                    </div>
                  </div>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Revoke
                    </Button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
