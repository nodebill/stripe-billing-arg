import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { listInvoices } from "@/modules/invoices/service";
import { listInvoicesSchema } from "@/modules/invoices/validation";

export async function GET(request: Request) {
  const session = await getSession(request);
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());

  const parsed = listInvoicesSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const list = await listInvoices(session.organizationId, parsed.data);
  return NextResponse.json(list);
}
