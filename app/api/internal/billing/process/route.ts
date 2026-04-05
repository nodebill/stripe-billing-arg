import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  getBillingProcessorState,
  processDueSubscriptions,
} from "@/modules/billing/service";

function getAuthorizedSecrets() {
  return [process.env.BILLING_PROCESSOR_SECRET, process.env.CRON_SECRET].filter(
    (value): value is string => Boolean(value)
  );
}

function isAuthorized(request: Request) {
  const secrets = getAuthorizedSecrets();
  if (secrets.length === 0) {
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const token = header.slice("Bearer ".length);
  return secrets.includes(token);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "Unauthorized billing processor request");
  }

  const state = await getBillingProcessorState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "Unauthorized billing processor request");
  }

  try {
    const summary = await processDueSubscriptions({
      trigger: "internal_route",
    });
    return NextResponse.json(summary);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Billing processor is already running"
    ) {
      return apiError(409, error.message);
    }

    throw error;
  }
}
