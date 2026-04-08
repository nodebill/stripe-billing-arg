import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  createSubscriptionSchedule,
  listSubscriptionSchedules,
  SubscriptionScheduleError,
} from "@/modules/subscription-schedules/service";
import {
  createSubscriptionScheduleSchema,
  listSubscriptionSchedulesSchema,
} from "@/modules/subscription-schedules/validation";

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

  const parsed = createSubscriptionScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const schedule = await createSubscriptionSchedule(parsed.data);
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    if (error instanceof SubscriptionScheduleError) {
      const status =
        error.code === "subscription_not_found" || error.code === "not_found"
          ? 404
          : 400;
      return apiError(status, error.message);
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listSubscriptionSchedulesSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listSubscriptionSchedules(parsed.data);
  return NextResponse.json(list);
}
