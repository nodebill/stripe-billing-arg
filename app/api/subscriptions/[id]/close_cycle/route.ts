import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  closeSubscriptionCycle,
  SubscriptionError,
} from "@/modules/subscriptions/service";
import { closeSubscriptionCycleSchema } from "@/modules/subscriptions/validation";
import { BillingCycleError } from "@/modules/billing/service";

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

  const parsed = closeSubscriptionCycleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const result = await closeSubscriptionCycle(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    if (error instanceof BillingCycleError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
