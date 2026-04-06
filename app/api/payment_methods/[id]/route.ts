import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  getPaymentMethod,
  PaymentMethodError,
  updatePaymentMethod,
} from "@/modules/payment-methods/service";
import { updatePaymentMethodSchema } from "@/modules/payment-methods/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const paymentMethod = await getPaymentMethod(id);
  if (!paymentMethod) {
    return apiError(404, `No such payment_method: '${id}'`);
  }

  return NextResponse.json(paymentMethod);
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

  const parsed = updatePaymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const paymentMethod = await updatePaymentMethod(
      id,
      parsed.data
    );
    return NextResponse.json(paymentMethod);
  } catch (error) {
    if (error instanceof PaymentMethodError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
