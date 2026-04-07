import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { createTaxId, listTaxIds } from "@/modules/customers/service";
import { createTaxIdSchema } from "@/modules/customers/validation";

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

  const parsed = createTaxIdSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0].message);
  }

  const result = await createTaxId(id, parsed.data);

  if (result === "not_found") {
    return apiError(404, `No such customer: '${id}'`);
  }
  if (result === "already_exists") {
    return apiError(400, "This customer already has a tax ID");
  }

  return NextResponse.json(result, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }
  const { id } = await params;

  const result = await listTaxIds(id);

  if (result === "not_found") {
    return apiError(404, `No such customer: '${id}'`);
  }

  return NextResponse.json(result);
}
