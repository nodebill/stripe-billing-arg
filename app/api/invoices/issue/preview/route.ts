import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { invoiceBatchActionSchema } from "@/modules/invoices/validation";
import {
  InvoiceWorkflowError,
  previewIssueInvoices,
} from "@/modules/invoices/workflow";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const parsed = invoiceBatchActionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  try {
    const result = await previewIssueInvoices(parsed.data.invoice_ids);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvoiceWorkflowError) {
      return apiError(400, error.message);
    }

    throw error;
  }
}
