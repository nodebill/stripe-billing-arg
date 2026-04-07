import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";
import { ensureTables } from "@/infrastructure/database/client";
import { getDb } from "@/infrastructure/database/client";

const BOOTSTRAP_SIGN_UP_HEADER = "x-bootstrap-sign-up-key";
const INVITE_TOKEN_HEADER = "x-team-invite-token";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
};

function getAuthSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  return "local-dev-auth-secret-change-me";
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInviteToken() {
  return nanoid(48);
}

export function getBootstrapSignUpHeader() {
  return BOOTSTRAP_SIGN_UP_HEADER;
}

export function getBootstrapSignUpValue() {
  return createHmac("sha256", getAuthSecret())
    .update("bootstrap-sign-up")
    .digest("hex");
}

export function getInviteTokenHeader() {
  return INVITE_TOKEN_HEADER;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function countUsers() {
  await ensureTables();
  const db = getDb();
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM "user"
  `);

  const row = result.rows[0] as { count: number | string } | undefined;
  return Number(row?.count ?? 0);
}

export async function hasAnyAuthUsers() {
  return (await countUsers()) > 0;
}

export async function getValidInviteByToken(token: string) {
  await ensureTables();
  const db = getDb();
  const tokenHash = hashInviteToken(token);
  const result = await db.execute(sql`
    SELECT id, email, role, expires_at, accepted_at, revoked_at
    FROM team_invites
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `);

  const row = result.rows[0] as InviteRow | undefined;
  if (!row) {
    return null;
  }

  if (row.accepted_at || row.revoked_at || row.expires_at < new Date()) {
    return null;
  }

  return row;
}

export async function assertAllowedSignUp(input: {
  headers: Headers;
  email?: string;
}) {
  const bootstrapKey = input.headers.get(BOOTSTRAP_SIGN_UP_HEADER);
  if (bootstrapKey) {
    if (!safeEqual(bootstrapKey, getBootstrapSignUpValue())) {
      throw new APIError("FORBIDDEN", {
        message: "Bootstrap sign-up is not authorized",
      });
    }

    if (await hasAnyAuthUsers()) {
      throw new APIError("FORBIDDEN", {
        message: "Bootstrap sign-up is no longer available",
      });
    }

    return;
  }

  const inviteToken = input.headers.get(INVITE_TOKEN_HEADER);
  if (!inviteToken) {
    throw new APIError("FORBIDDEN", {
      message: "Public sign-up is disabled",
    });
  }

  const invite = await getValidInviteByToken(inviteToken);
  if (!invite) {
    throw new APIError("FORBIDDEN", {
      message: "Invitation is invalid or expired",
    });
  }

  if (!input.email || invite.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new APIError("FORBIDDEN", {
      message: "Invitation email does not match this sign-up request",
    });
  }
}
