import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createPrice, listPrices } from "@/modules/prices/service";
import {
  createPriceSchema,
  listPricesSchema,
} from "@/modules/prices/validation";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

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

  const result = await createPrice(parsed.data);
  if (!result) {
    return apiError(404, `No such product: '${parsed.data.product}'`);
  }
  if ("error" in result) {
    return apiError(400, result.error);
  }

  return NextResponse.json(result, { status: 201 });
}

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listPricesSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listPrices(parsed.data);
  return NextResponse.json(list);
}
