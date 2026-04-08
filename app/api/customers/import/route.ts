import { NextResponse } from "next/server";
import { requireApiSession } from "@/infrastructure/auth";
import { apiError } from "@/lib/api-error";
import { importCustomers } from "@/modules/customers/import";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) {
    return session;
  }

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

  const result = await importCustomers(await file.text());
  if ("type" in result) {
    return apiError(400, result.message);
  }

  return NextResponse.json(result);
}
