import { NextResponse } from "next/server";
import { getSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { getInvoice } from "@/modules/invoices/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  const { id } = await params;

  const invoice = await getInvoice(session.organizationId, id);
  if (!invoice) {
    return apiError(404, `No such invoice: '${id}'`);
  }

  return NextResponse.json(invoice);
}
