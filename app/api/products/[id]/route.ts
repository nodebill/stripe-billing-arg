import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  deleteProduct,
  getProduct,
  updateProduct,
} from "@/modules/products/service";
import { updateProductSchema } from "@/modules/products/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const product = await getProduct(id);
  if (!product) {
    return apiError(404, `No such product: '${id}'`);
  }

  return NextResponse.json(product);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  let product;
  try {
    product = await updateProduct(id, parsed.data);
  } catch (error) {
    if (error instanceof Error) {
      return apiError(400, error.message);
    }

    return apiError(400, "Could not update product");
  }

  if (!product) {
    return apiError(404, `No such product: '${id}'`);
  }

  return NextResponse.json(product);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const result = await deleteProduct(id);
  if (result === "has_prices") {
    return apiError(
      400,
      "This product has prices and cannot be deleted. Archive the product or its prices instead."
    );
  }

  if (!result) {
    return apiError(404, `No such product: '${id}'`);
  }

  return NextResponse.json(result);
}
