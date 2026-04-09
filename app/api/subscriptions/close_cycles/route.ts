import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { bulkCloseSubscriptionCycles } from "@/modules/subscriptions/service";
import { bulkCloseSubscriptionCyclesSchema } from "@/modules/subscriptions/validation";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = bulkCloseSubscriptionCyclesSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const result = await bulkCloseSubscriptionCycles(parsed.data);
  return NextResponse.json(result);
}
