import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { getInvoice } from "@/modules/invoices/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const invoice = await getInvoice(id);
  if (!invoice) {
    return apiError(404, `No such invoice: '${id}'`);
  }

  return NextResponse.json(invoice);
}
