import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  createSubscription,
  listSubscriptions,
  SubscriptionError,
} from "@/modules/subscriptions/service";
import {
  createSubscriptionSchema,
  listSubscriptionsSchema,
} from "@/modules/subscriptions/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const subscription = await createSubscription(
      session.organizationId,
      parsed.data
    );
    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const session = await getSession(request);
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listSubscriptionsSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listSubscriptions(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
