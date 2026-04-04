import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createPrice, listPrices } from "@/modules/prices/service";
import {
  createPriceSchema,
  listPricesSchema,
} from "@/modules/prices/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createPriceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const price = await createPrice(session.organizationId, parsed.data);
  if (!price) {
    return apiError(404, `No such product: '${parsed.data.product}'`);
  }

  return NextResponse.json(price, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getSession(request);
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listPricesSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listPrices(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
