import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { getPrice, updatePrice } from "@/modules/prices/service";
import { updatePriceSchema } from "@/modules/prices/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  const price = await getPrice(session.organizationId, id);
  if (!price) {
    return apiError(404, `No such price: '${id}'`);
  }

  return NextResponse.json(price);
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

  const parsed = updatePriceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const price = await updatePrice(session.organizationId, id, parsed.data);
  if (!price) {
    return apiError(404, `No such price: '${id}'`);
  }

  return NextResponse.json(price);
}
