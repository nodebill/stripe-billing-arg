import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import {
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from "@/modules/customers/service";
import { updateCustomerSchema } from "@/modules/customers/validation";

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

  return NextResponse.json(customer);
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

  const parsed = updateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const customer = await updateCustomer(id, parsed.data);
  if (!customer) {
    return apiError(404, `No such customer: '${id}'`);
  }

  return NextResponse.json(customer);
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

  const result = await deleteCustomer(id);
  if (result === "has_subscriptions") {
    return apiError(
      400,
      "This customer has active subscriptions and cannot be deleted."
    );
  }

  if (!result) {
    return apiError(404, `No such customer: '${id}'`);
  }

  return NextResponse.json(result);
}
