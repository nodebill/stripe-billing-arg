import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  listMeterEventSummaries,
  MeterEventError,
} from "@/modules/meter-events/service";
import {
  listMeterEventSummariesSchema,
  meterEventSummaryMeterIdSchema,
} from "@/modules/meter-events/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const parsedId = meterEventSummaryMeterIdSchema.safeParse(id);
  if (!parsedId.success) {
    return apiError(400, parsedId.error.issues[0].message);
  }

  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = listMeterEventSummariesSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const summaries = await listMeterEventSummaries(
      parsedId.data,
      parsed.data
    );

    return NextResponse.json(summaries);
  } catch (error) {
    if (error instanceof MeterEventError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
