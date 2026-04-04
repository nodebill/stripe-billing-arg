import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  attachPaymentMethod,
  PaymentMethodError,
} from "@/modules/payment-methods/service";
import { attachPaymentMethodSchema } from "@/modules/payment-methods/validation";

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

  const parsed = attachPaymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const paymentMethod = await attachPaymentMethod(
      session.organizationId,
      id,
      parsed.data
    );
    return NextResponse.json(paymentMethod);
  } catch (error) {
    if (error instanceof PaymentMethodError) {
      const status =
        error.code === "not_found" || error.code === "customer_not_found"
          ? 404
          : 400;
      return apiError(status, error.message);
    }

    throw error;
  }
}
