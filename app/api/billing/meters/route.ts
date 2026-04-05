import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createMeter, listMeters } from "@/modules/meters/service";
import {
  createMeterSchema,
  listMetersSchema,
} from "@/modules/meters/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createMeterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const result = await createMeter(session.organizationId, parsed.data);
  if ("error" in result) {
    return apiError(400, result.error);
  }

  return NextResponse.json(result, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getSession(request);
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listMetersSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listMeters(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
