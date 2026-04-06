import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { getCustomer } from "@/modules/customers/service";
import { listCustomerPaymentMethods } from "@/modules/payment-methods/service";
import { listCustomerPaymentMethodsSchema } from "@/modules/payment-methods/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer) {
    return apiError(404, `No such customer: '${id}'`);
  }

  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = listCustomerPaymentMethodsSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listCustomerPaymentMethods(
    id,
    parsed.data
  );
  return NextResponse.json(list);
}
