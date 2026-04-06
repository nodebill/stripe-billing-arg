import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  detachPaymentMethod,
  PaymentMethodError,
} from "@/modules/payment-methods/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;
  void request;

  try {
    const paymentMethod = await detachPaymentMethod(id);
    return NextResponse.json(paymentMethod);
  } catch (error) {
    if (error instanceof PaymentMethodError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.message);
    }

    throw error;
  }
}
