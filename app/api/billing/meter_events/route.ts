import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createMeterEvent, createMeterEventBulk, MeterEventError } from "@/modules/meter-events/service";
import { createMeterEventSchema } from "@/modules/meter-events/validation";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[meter_events] Invalid JSON body");
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createMeterEventSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[meter_events] Validation failed:", parsed.error.issues, "| body:", JSON.stringify(body));
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const count = parsed.data.count ?? 1;
    const result = count > 1
      ? await createMeterEventBulk(parsed.data)
      : await createMeterEvent(parsed.data);
    return NextResponse.json(result.event, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof MeterEventError) {
      console.error("[meter_events]", error.code, error.message, "| body:", JSON.stringify(body));
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
