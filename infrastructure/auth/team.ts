import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { auth, MACHINE_API_KEY_CONFIG_ID } from "./auth";
import {
  apikey,
  teamInvites,
  user,
} from "@/infrastructure/database/schema";
import { getDb } from "@/infrastructure/database/client";
import { createInviteToken, getValidInviteByToken, hashInviteToken } from "./sign-up-policy";

type TeamRole = "admin" | "user";

export async function listTeamMembers() {
  const db = getDb();
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt), desc(user.id));
}

export async function listPendingInvites() {
  const db = getDb();
  return db
    .select()
    .from(teamInvites)
    .where(
      and(
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
        gt(teamInvites.expiresAt, new Date())
      )
    )
    .orderBy(desc(teamInvites.createdAt), desc(teamInvites.id));
}

export async function createTeamInvite(input: {
  email: string;
  role: TeamRole;
  createdByUserId: string;
  baseURL: string;
}) {
  const db = getDb();
  const token = createInviteToken();
  const now = new Date();
  const invite = {
    id: `inv_${token.slice(0, 12)}`,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
    acceptedAt: null,
    revokedAt: null,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  } as const;

  await db.insert(teamInvites).values(invite);

  return {
    invite,
    url: `${input.baseURL}/accept-invite?token=${token}`,
  };
}

export async function revokeTeamInvite(inviteId: string) {
  const db = getDb();
  await db
    .update(teamInvites)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(teamInvites.id, inviteId));
}

export async function bootstrapFirstAdmin(input: {
  email: string;
  name: string;
  password: string;
}) {
  return auth.api.createUser({
    body: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      password: input.password,
      role: "admin",
    },
  });
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}) {
  const invite = await getValidInviteByToken(input.token);
  if (!invite) {
    throw new Error("Invitation is invalid or expired");
  }

  await auth.api.createUser({
    body: {
      email: invite.email.toLowerCase(),
      name: input.name.trim(),
      password: input.password,
      role: invite.role as TeamRole,
    },
  });

  const db = getDb();
  await db
    .update(teamInvites)
    .set({
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(teamInvites.id, invite.id));

  return invite;
}

export async function listMachineApiKeys() {
  const db = getDb();
  return db
    .select()
    .from(apikey)
    .where(eq(apikey.configId, MACHINE_API_KEY_CONFIG_ID))
    .orderBy(desc(apikey.createdAt), desc(apikey.id));
}

export async function createMachineApiKey(input: {
  userId: string;
  name: string;
  headers: Headers;
}) {
  return auth.api.createApiKey({
    headers: input.headers,
    body: {
      configId: MACHINE_API_KEY_CONFIG_ID,
      name: input.name.trim(),
      userId: input.userId,
    },
  });
}

export async function deleteMachineApiKey(input: {
  keyId: string;
  headers: Headers;
}) {
  return auth.api.deleteApiKey({
    headers: input.headers,
    body: {
      configId: MACHINE_API_KEY_CONFIG_ID,
      keyId: input.keyId,
    },
  });
}
