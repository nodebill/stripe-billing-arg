import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { updateProduct, deleteProduct } from "@/modules/products/service";
import { updateProductSchema } from "@/modules/products/validation";

function apiError(status: number, message: string) {
  return NextResponse.json(
    { error: { type: "invalid_request_error", message } },
    { status }
  );
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

  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const product = await updateProduct(session.organizationId, id, parsed.data);
  if (!product) {
    return apiError(404, `No such product: '${id}'`);
  }

  return NextResponse.json(product);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  const result = await deleteProduct(session.organizationId, id);
  if (!result) {
    return apiError(404, `No such product: '${id}'`);
  }

  return NextResponse.json(result);
}
