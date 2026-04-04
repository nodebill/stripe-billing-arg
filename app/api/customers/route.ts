import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createCustomer, listCustomers } from "@/modules/customers/service";
import {
  createCustomerSchema,
  listCustomersSchema,
} from "@/modules/customers/validation";

export async function POST(request: Request) {
  const session = await getSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const customer = await createCustomer(session.organizationId, parsed.data);
  return NextResponse.json(customer, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getSession(request);

  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listCustomersSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listCustomers(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
