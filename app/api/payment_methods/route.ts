import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createPaymentMethod } from "@/modules/payment-methods/service";
import { createPaymentMethodSchema } from "@/modules/payment-methods/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = createPaymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const paymentMethod = await createPaymentMethod(
    session.organizationId,
    parsed.data
  );
  return NextResponse.json(paymentMethod, { status: 201 });
}
