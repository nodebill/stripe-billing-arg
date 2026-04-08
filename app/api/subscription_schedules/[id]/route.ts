import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  getSubscriptionSchedule,
  updateSubscriptionSchedule,
  SubscriptionScheduleError,
} from "@/modules/subscription-schedules/service";
import { updateSubscriptionScheduleSchema } from "@/modules/subscription-schedules/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const schedule = await getSubscriptionSchedule(id);
  if (!schedule) {
    return apiError(404, `No such subscription schedule: '${id}'`);
  }

  return NextResponse.json(schedule);
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

  const parsed = updateSubscriptionScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const schedule = await updateSubscriptionSchedule(id, parsed.data);
    return NextResponse.json(schedule);
  } catch (error) {
    if (error instanceof SubscriptionScheduleError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
