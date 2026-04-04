import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { deactivateMeter } from "@/modules/meters/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  const meter = await deactivateMeter(session.organizationId, id);
  if (!meter) {
    return apiError(404, `No such meter: '${id}'`);
  }

  return NextResponse.json(meter);
}
