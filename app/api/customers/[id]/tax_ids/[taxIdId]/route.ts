import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { deleteTaxId } from "@/modules/customers/service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taxIdId: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id, taxIdId } = await params;

  const result = await deleteTaxId(id, taxIdId);

  if (result === "not_found") {
    return apiError(404, `No such customer: '${id}'`);
  }
  if (result === "tax_id_not_found") {
    return apiError(404, `No such tax ID: '${taxIdId}'`);
  }

  return NextResponse.json(result);
}
