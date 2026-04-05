import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { getMeter, updateMeter } from "@/modules/meters/service";
import { updateMeterSchema } from "@/modules/meters/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  const meter = await getMeter(session.organizationId, id);
  if (!meter) {
    return apiError(404, `No such meter: '${id}'`);
  }

  return NextResponse.json(meter);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = updateMeterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const meter = await updateMeter(session.organizationId, id, parsed.data);
  if (!meter) {
    return apiError(404, `No such meter: '${id}'`);
  }

  return NextResponse.json(meter);
}
