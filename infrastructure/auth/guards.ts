import { sql } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { apiError } from "@/lib/api-error";
import { auth, MACHINE_API_KEY_CONFIG_ID } from "./auth";
import type { ApiPrincipal, AuthSession } from "./types";
import { getDb } from "@/infrastructure/database/client";

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

async function findAuthUserById(userId: string) {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, email, name, role, banned
    FROM "user"
    WHERE id = ${userId}
    LIMIT 1
  `);

  return (result.rows[0] as
    | {
        id: string;
        email: string;
        name: string;
        role: string | null;
        banned: boolean | null;
      }
    | undefined) ?? null;
}

async function requireAuthUserRecord(userId: string) {
  const user = await findAuthUserById(userId);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? "user",
    banned: Boolean(user.banned),
  };
}

async function getSessionFromHeaders(headers: Headers): Promise<AuthSession | null> {
  return auth.api.getSession({
    headers,
  });
}

export async function getServerSession() {
  const session = await getSessionFromHeaders(await nextHeaders());
  return session;
}

export async function getServerPrincipal() {
  const session = await getServerSession();
  if (!session) {
    return null;
  }

  const user = await requireAuthUserRecord(session.user.id);
  if (!user || user.banned) {
    return null;
  }

  return {
    session,
    user,
  };
}

export async function requireServerSession() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireServerAdmin() {
  const principal = await getServerPrincipal();
  if (!principal) {
    redirect("/sign-in");
  }

  if (principal.user.role !== "admin") {
    redirect("/");
  }

  return principal;
}

export async function resolveApiPrincipal(
  request: Request
): Promise<ApiPrincipal | null> {
  const session = await getSessionFromHeaders(request.headers);
  if (session) {
    const user = await requireAuthUserRecord(session.user.id);
    if (!user || user.banned) {
      return null;
    }

    return {
      kind: "session",
      session,
      user,
      apiKey: null,
    };
  }

  const apiKeyHeader = request.headers.get("x-api-key");
  if (!apiKeyHeader) {
    return null;
  }

  const verified = await auth.api.verifyApiKey({
    body: {
      configId: MACHINE_API_KEY_CONFIG_ID,
      key: apiKeyHeader,
    },
  });

  if (!verified.valid || !verified.key) {
    return null;
  }

  const user = await requireAuthUserRecord(verified.key.referenceId);
  if (!user || user.banned) {
    return null;
  }

  return {
    kind: "api-key",
    session: null,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "user",
      banned: Boolean(user.banned),
    },
    apiKey: {
      id: verified.key.id,
      configId: verified.key.configId,
      referenceId: verified.key.referenceId,
      name: verified.key.name,
    },
  };
}

export async function requireUser(request: Request) {
  const principal = await resolveApiPrincipal(request);
  if (!principal) {
    throw new AuthError(401, "Authentication required");
  }

  return principal;
}

export async function requireApiSession(request: Request) {
  try {
    return await requireUser(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return apiError(error.status, error.message);
    }

    throw error;
  }
}

export async function requireAdmin(request: Request) {
  const principal = await requireUser(request);
  if (principal.user.role !== "admin") {
    throw new AuthError(403, "Admin access required");
  }

  return principal;
}
