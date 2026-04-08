import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  releaseSubscriptionSchedule,
  SubscriptionScheduleError,
} from "@/modules/subscription-schedules/service";

export async function POST(
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
    const schedule = await releaseSubscriptionSchedule(id);
    return NextResponse.json(schedule);
  } catch (error) {
    if (error instanceof SubscriptionScheduleError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
