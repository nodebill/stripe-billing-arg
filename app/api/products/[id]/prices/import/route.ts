import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { importPricesForProduct } from "@/modules/prices/import";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

  const { id } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(400, "Invalid form data");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "Attach one CSV file in the 'file' field");
  }

  const result = await importPricesForProduct(id, await file.text());

  if ("type" in result) {
    if (result.type === "not_found") {
      return apiError(404, result.message);
    }

    return apiError(400, result.message);
  }

  return NextResponse.json(result);
}
