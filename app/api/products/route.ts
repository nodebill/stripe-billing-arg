import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { createProduct, listProducts } from "@/modules/products/service";
import {
  createProductSchema,
  listProductsSchema,
} from "@/modules/products/validation";

function apiError(status: number, message: string) {
  return NextResponse.json(
    { error: { type: "invalid_request_error", message } },
    { status }
  );
}

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const product = await createProduct(session.organizationId, parsed.data);
  return NextResponse.json(product, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getSession(request);

  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listProductsSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listProducts(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
