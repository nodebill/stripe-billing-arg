import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  cancelSubscription,
  getSubscription,
  SubscriptionError,
  updateSubscription,
} from "@/modules/subscriptions/service";
import { updateSubscriptionSchema } from "@/modules/subscriptions/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const subscription = await getSubscription(id);
  if (!subscription) {
    return apiError(404, `No such subscription: '${id}'`);
  }

  return NextResponse.json(subscription);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = updateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const subscription = await updateSubscription(
      id,
      parsed.data
    );
    return NextResponse.json(subscription);
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;
  void request;

  try {
    const subscription = await cancelSubscription(id);
    return NextResponse.json(subscription);
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
