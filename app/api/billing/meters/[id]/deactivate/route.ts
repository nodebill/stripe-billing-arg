import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { deactivateMeter } from "@/modules/meters/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const meter = await deactivateMeter(id);
  if (!meter) {
    return apiError(404, `No such meter: '${id}'`);
  }

  return NextResponse.json(meter);
}
