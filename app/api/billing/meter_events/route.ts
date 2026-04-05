import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createMeterEvent, MeterEventError } from "@/modules/meter-events/service";
import { createMeterEventSchema } from "@/modules/meter-events/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createMeterEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const result = await createMeterEvent(session.organizationId, parsed.data);
    return NextResponse.json(result.event, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof MeterEventError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
