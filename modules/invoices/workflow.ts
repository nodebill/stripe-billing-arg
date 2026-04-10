import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  customers,
  invoiceDeliveries,
  invoices,
  subscriptions,
} from "@/infrastructure/database/schema";
import { SEND_INVOICE_DUE_DAYS } from "@/modules/billing/policy";
import { runWithBillingLease } from "@/modules/billing/service";
import { toUnix } from "@/modules/shared/time";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { getInvoice } from "./service";
import type {
  InvoiceBatchResult,
  InvoiceCollectionMethod,
  InvoiceIssuePreview,
  InvoiceIssuePreviewResult,
  InvoiceLegalDocument,
  InvoicePaymentStatus,
  InvoiceTaxCondition,
  InvoiceType,
} from "./types";

type InvoiceRow = typeof invoices.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;

type AfipConfig = {
  authToken: string;
  cert: string;
  key: string;
  representedTaxId: string;
  environment: "dev" | "prod";
  baseUrl: string;
  pointOfSale: number;
};

/** AFIP web service id passed to auth; sessions are not interchangeable across services. */
type AfipWsid = "ws_sr_constancia_inscripcion" | "wsfe";

type PdfConfig = {
  endpoint: string;
  bearerToken: string;
  baseFilePath?: string;
};

type EmailConfig = {
  apiKey: string;
  from: string;
  subjectPrefix: string;
  bcc: string[];
};

type AfipSession = {
  token: string;
  sign: string;
  expiration?: string;
};

type CustomerFiscalProfile = {
  businessName: string;
  address: string;
  taxId: string;
  taxCondition: InvoiceTaxCondition;
  invoiceType: InvoiceType;
};

type AfipInvoiceData = {
  invoiceNumber: number;
  invoiceDate: string;
  cae: string;
  caeDueDate: string;
};

type AfipIssueRequestPayload = {
  Auth: {
    Token: string;
    Sign: string;
    Cuit: string;
  };
  FeCAEReq: {
    FeCabReq: {
      CantReg: number;
      PtoVta: number;
      CbteTipo: number;
    };
    FeDetReq: {
      FECAEDetRequest: {
        Concepto: number;
        DocTipo: number;
        DocNro: number;
        CbteDesde: number;
        CbteHasta: number;
        CbteFch: string;
        FchServDesde: string;
        FchServHasta: string;
        FchVtoPago: string;
        ImpTotal: number;
        ImpTotConc: number;
        ImpNeto: number;
        ImpOpEx: number;
        ImpIVA: number;
        ImpTrib: number;
        MonId: string;
        MonCotiz: number;
        CondicionIVAReceptorId: number;
        Iva: {
          AlicIva: Array<{
            Id: number;
            BaseImp: number;
            Importe: number;
          }>;
        };
      };
    };
  };
};

type PdfRequestPayload = {
  invoiceNumber: number;
  invoiceDate: string;
  documentNumber: number;
  titularName: string;
  ivaCondition: InvoiceTaxCondition;
  address: string;
  fromDate: string;
  duePaymentDate: string;
  toDate: string;
  dueDate: string;
  CAE: string | null;
  netPaid: number;
  totalPaid: number;
  taxPaid: number;
  s3FileName: string;
};

type IssuePreviewContext = {
  subscription: SubscriptionRow;
  fiscalProfile: CustomerFiscalProfile;
  paymentStatus: InvoicePaymentStatus;
  dueDate: Date | null;
  estimatedInvoiceNumber: number;
  afipRequest: AfipIssueRequestPayload;
  pdfRequest: PdfRequestPayload;
  warnings: string[];
};

const afipSessionCache = new Map<string, AfipSession>();

export class InvoiceWorkflowError extends Error {}

type WorkflowLogLevel = "info" | "warn" | "error";

function logWorkflow(
  level: WorkflowLogLevel,
  message: string,
  context?: Record<string, unknown>,
) {
  const payload = context ? { message, ...context } : { message };
  if (level === "error") {
    console.error("[invoice-workflow]", payload);
    return;
  }
  if (level === "warn") {
    console.warn("[invoice-workflow]", payload);
    return;
  }
  console.info("[invoice-workflow]", payload);
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "invalid_email";
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

function emptyBatchResult(action: "issue" | "send"): InvoiceBatchResult {
  return {
    object: "invoice_batch",
    action,
    processed_invoices: 0,
    failed_invoices: 0,
    results: [],
  };
}

function emptyPreviewResult(): InvoiceIssuePreviewResult {
  return {
    object: "invoice_issue_preview_batch",
    previewed_invoices: 0,
    failed_invoices: 0,
    results: [],
  };
}

function sanitizeTaxId(value: string) {
  return value.replaceAll(/\D/g, "");
}

function isJuridicalTaxId(taxId: string) {
  return taxId.startsWith("3");
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InvoiceWorkflowError(
      `Missing required environment variable: ${name}`,
    );
  }
  return value;
}

function getAfipConfig(): AfipConfig {
  return {
    authToken: requireEnv("AFIP_AUTH_TOKEN"),
    cert: requireEnv("AFIP_AUTH_CERT"),
    key: requireEnv("AFIP_AUTH_KEY"),
    representedTaxId:
      process.env.AFIP_AUTH_TAX_ID?.trim() ?? requireEnv("TALO_CUIT"),
    environment:
      process.env.AFIP_ENVIRONMENT?.trim() === "dev" ? "dev" : "prod",
    baseUrl:
      process.env.AFIP_BASE_URL?.trim() ||
      "https://app.afipsdk.com/api/v1/afip",
    pointOfSale: Number(process.env.AFIP_POINT_OF_SALE?.trim() || "2"),
  };
}

function getPdfConfig(): PdfConfig {
  return {
    endpoint: requireEnv("INVOICE_PDF_ENDPOINT"),
    bearerToken: requireEnv("INVOICE_PDF_BEARER_TOKEN"),
    baseFilePath: process.env.INVOICE_PDF_BASE_FILE_PATH?.trim() || undefined,
  };
}

function getEmailConfig(): EmailConfig {
  return {
    apiKey: requireEnv("RESEND_API_KEY"),
    from: requireEnv("INVOICE_EMAIL_FROM"),
    subjectPrefix:
      process.env.INVOICE_EMAIL_SUBJECT_PREFIX?.trim() || "Factura",
    bcc: (process.env.INVOICE_EMAIL_BCC || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function formatDateForAfip(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getInvoiceDate(periodEnd: Date) {
  const invoiceDate = new Date(periodEnd);
  invoiceDate.setUTCDate(invoiceDate.getUTCDate() - 1);
  return invoiceDate;
}

function toMajorCurrencyUnit(amount: number) {
  return amount / 100;
}

function buildPdfFileName(documentNumber: number, baseFilePath?: string) {
  const now = new Date();
  const month = now.getUTCMonth();
  const prevMonth = String(month === 0 ? 12 : month).padStart(2, "0");
  const year = month === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const prefix = baseFilePath
    ? baseFilePath.replace(/\/$/, "")
    : `${year}${prevMonth}`;
  return `${prefix}/factura_${documentNumber}.pdf`;
}

function resolveAdvancedRenewalMode(
  subscription: SubscriptionRow,
  nextPeriodEnd: Date,
  runAt: Date,
) {
  if (subscription.renewalMode === "automatic") {
    return "automatic" as const;
  }

  return nextPeriodEnd.getTime() > runAt.getTime()
    ? "automatic"
    : "manual_until_current";
}

async function loadSelectedInvoices(invoiceIds: string[]) {
  const db = getDb();
  const uniqueInvoiceIds = [...new Set(invoiceIds)];
  logWorkflow("info", "Loading selected invoices", {
    requestedCount: invoiceIds.length,
    uniqueCount: uniqueInvoiceIds.length,
  });
  const rows = await db
    .select()
    .from(invoices)
    .where(inArray(invoices.id, uniqueInvoiceIds))
    .orderBy(asc(invoices.createdAt), asc(invoices.id));

  if (rows.length !== uniqueInvoiceIds.length) {
    const foundIds = new Set(rows.map((row) => row.id));
    const missingId = uniqueInvoiceIds.find(
      (invoiceId) => !foundIds.has(invoiceId),
    );
    throw new InvoiceWorkflowError(
      `No such invoice: '${missingId ?? "unknown"}'`,
    );
  }

  logWorkflow("info", "Loaded selected invoices", {
    loadedCount: rows.length,
  });
  return rows;
}

async function getCustomerRow(customerId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  return rows[0] ?? null;
}

async function getSubscriptionRow(subscriptionId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  return rows[0] ?? null;
}

async function initializeAfipSession(
  config: AfipConfig,
  wsid: AfipWsid,
): Promise<AfipSession> {
  const cacheKey = [
    wsid,
    config.environment,
    config.baseUrl,
    config.representedTaxId,
    config.cert,
    config.key,
  ].join(":");
  const cached = afipSessionCache.get(cacheKey);

  if (cached?.token && cached.sign) {
    logWorkflow("info", "Using cached AFIP session", {
      wsid,
      environment: config.environment,
      representedTaxId: config.representedTaxId,
    });
    return cached;
  }

  logWorkflow("info", "Creating AFIP session", {
    wsid,
    environment: config.environment,
    representedTaxId: config.representedTaxId,
  });

  const response = await fetch(`${config.baseUrl}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
    },
    body: JSON.stringify({
      environment: config.environment,
      tax_id: config.representedTaxId,
      wsid,
      cert: config.cert,
      key: config.key,
    }),
  });

  const data = (await response.json()) as AfipSession & { error?: string };
  if (!response.ok || !data.token || !data.sign) {
    logWorkflow("error", "AFIP authentication failed", {
      wsid,
      environment: config.environment,
      representedTaxId: config.representedTaxId,
      status: response.status,
      hasToken: Boolean(data.token),
      hasSign: Boolean(data.sign),
      error: data.error ?? null,
    });
    throw new InvoiceWorkflowError(data.error || "AFIP authentication failed");
  }

  afipSessionCache.set(cacheKey, data);
  logWorkflow("info", "AFIP session created", {
    wsid,
    environment: config.environment,
    representedTaxId: config.representedTaxId,
  });
  return data;
}

async function requestAfip(config: AfipConfig, body: Record<string, unknown>) {
  logWorkflow("info", "Sending AFIP request", {
    method: typeof body.method === "string" ? body.method : "unknown",
    wsid: typeof body.wsid === "string" ? body.wsid : "unknown",
    environment: config.environment,
  });
  const response = await fetch(`${config.baseUrl}/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
    },
    body: JSON.stringify({
      environment: config.environment,
      ...body,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    logWorkflow("error", "AFIP request failed", {
      method: typeof body.method === "string" ? body.method : "unknown",
      wsid: typeof body.wsid === "string" ? body.wsid : "unknown",
      status: response.status,
      error: data?.error ?? data?.message ?? null,
    });
    throw new InvoiceWorkflowError(
      data?.error || data?.message || "AFIP request failed",
    );
  }

  logWorkflow("info", "AFIP request completed", {
    method: typeof body.method === "string" ? body.method : "unknown",
    wsid: typeof body.wsid === "string" ? body.wsid : "unknown",
    status: response.status,
  });
  return data;
}

function extractPersonaResponse(data: any) {
  return (
    data?.personaReturn ||
    data?.getPersona_v2Return?.personaReturn ||
    data?.getPersona_v2Return ||
    data?.data?.personaReturn ||
    null
  );
}

function formatFiscalAddress(address: any) {
  if (!address || typeof address !== "object") {
    return "";
  }

  const parts = [
    address.direccion,
    address.localidad,
    address.descripcionProvincia,
    address.codPostal,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return parts.join(", ");
}

function resolveTaxCondition(persona: any, taxId: string): InvoiceTaxCondition {
  if (persona?.datosMonotributo?.categoriaMonotributo) {
    return "MONOTRIBUTO";
  }

  if (
    persona?.datosRegimenGeneral &&
    typeof persona.datosRegimenGeneral === "object" &&
    Object.keys(persona.datosRegimenGeneral).length > 0
  ) {
    return "RESPONSABLE_INSCRIPTO";
  }

  if (isJuridicalTaxId(taxId)) {
    return "RESPONSABLE_INSCRIPTO";
  }

  return "CONSUMIDOR_FINAL";
}

async function loadCustomerFiscalProfile(
  customer: CustomerRow,
): Promise<CustomerFiscalProfile> {
  logWorkflow("info", "Loading customer fiscal profile", {
    customerId: customer.id,
  });
  const rawTaxId = customer.taxId?.value?.trim();
  if (!rawTaxId) {
    throw new InvoiceWorkflowError(
      `Customer '${customer.id}' is missing a tax ID required for legal invoicing`,
    );
  }

  const taxId = sanitizeTaxId(rawTaxId);
  if (!taxId) {
    throw new InvoiceWorkflowError(
      `Customer '${customer.id}' does not have a valid numeric tax ID`,
    );
  }

  const config = getAfipConfig();
  const session = await initializeAfipSession(
    config,
    "ws_sr_constancia_inscripcion",
  );
  const data = await requestAfip(config, {
    method: "getPersona_v2",
    wsid: "ws_sr_constancia_inscripcion",
    params: {
      token: session.token,
      sign: session.sign,
      cuitRepresentada: config.representedTaxId,
      idPersona: Number(taxId),
    },
  });

  const persona = extractPersonaResponse(data);

  const taxCondition = resolveTaxCondition(persona, taxId);
  logWorkflow("info", "Customer fiscal profile resolved", {
    customerId: customer.id,
    taxCondition,
    invoiceType:
      taxCondition === "CONSUMIDOR_FINAL" ? "FACTURA_B" : "FACTURA_A",
  });
  return {
    businessName: customer.name!,
    address: `${customer.address?.line1}, ${customer.address?.city}, ${customer.address?.state}, ${customer.address?.postal_code}, ${customer.address?.country}`,
    taxId,
    taxCondition,
    invoiceType:
      taxCondition === "CONSUMIDOR_FINAL" ? "FACTURA_B" : "FACTURA_A",
  };
}

const VOUCHER_TYPES: Record<InvoiceType, 1 | 6> = {
  FACTURA_A: 1,
  FACTURA_B: 6,
};

const DOCUMENT_TYPES: Record<InvoiceType, 80 | 99> = {
  FACTURA_A: 80,
  FACTURA_B: 99,
};

const RECEIVER_IVA_CONDITION: Record<InvoiceTaxCondition, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  MONOTRIBUTO: 6,
  CONSUMIDOR_FINAL: 5,
};

async function getVoucherNumber(
  config: AfipConfig,
  session: AfipSession,
  invoiceType: InvoiceType,
) {
  logWorkflow("info", "Fetching AFIP voucher number", {
    invoiceType,
    pointOfSale: config.pointOfSale,
  });
  const data = await requestAfip(config, {
    method: "FECompUltimoAutorizado",
    wsid: "wsfe",
    params: {
      Auth: {
        Token: session.token,
        Sign: session.sign,
        Cuit: config.representedTaxId,
      },
      PtoVta: config.pointOfSale,
      CbteTipo: VOUCHER_TYPES[invoiceType],
    },
  });

  const lastVoucher = Number(
    data?.FECompUltimoAutorizadoResult?.CbteNro ??
      data?.FECompUltimoAutorizadoResult?.cbteNro ??
      0,
  );

  if (!Number.isFinite(lastVoucher)) {
    throw new InvoiceWorkflowError("Unable to fetch AFIP voucher number");
  }

  logWorkflow("info", "AFIP voucher number fetched", {
    invoiceType,
    pointOfSale: config.pointOfSale,
    lastVoucher,
  });
  return lastVoucher;
}

function resolveIssueOutcome(
  collectionMethod: InvoiceCollectionMethod,
  invoiceDueDate: Date | null,
  runAt: Date,
) {
  const paymentStatus: InvoicePaymentStatus =
    collectionMethod === "charge_automatically" ? "paid" : "pending";
  const dueDate =
    collectionMethod === "send_invoice"
      ? new Date(runAt.getTime() + SEND_INVOICE_DUE_DAYS * 86400_000)
      : invoiceDueDate;

  return {
    paymentStatus,
    dueDate,
  };
}

function buildAfipIssueRequest(
  invoice: InvoiceRow,
  fiscalProfile: CustomerFiscalProfile,
  session: AfipSession,
  config: AfipConfig,
  voucherNumber: number,
  runAt: Date,
): AfipIssueRequestPayload {
  if (invoice.currency.toUpperCase() !== "ARS") {
    throw new InvoiceWorkflowError(
      `Invoice '${invoice.id}' uses ${invoice.currency}; legal invoicing currently supports ARS only`,
    );
  }

  const invoiceDate = getInvoiceDate(invoice.periodEnd);
  return {
    Auth: {
      Token: session.token,
      Sign: session.sign,
      Cuit: config.representedTaxId,
    },
    FeCAEReq: {
      FeCabReq: {
        CantReg: 1,
        PtoVta: config.pointOfSale,
        CbteTipo: VOUCHER_TYPES[fiscalProfile.invoiceType],
      },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: 2,
          DocTipo: DOCUMENT_TYPES[fiscalProfile.invoiceType],
          DocNro:
            fiscalProfile.invoiceType === "FACTURA_A"
              ? Number(fiscalProfile.taxId)
              : 0,
          CbteDesde: voucherNumber + 1,
          CbteHasta: voucherNumber + 1,
          CbteFch: formatDateForAfip(invoiceDate),
          FchServDesde: formatDateForAfip(invoice.periodStart),
          FchServHasta: formatDateForAfip(invoice.periodEnd),
          FchVtoPago: formatDateForAfip(runAt),
          ImpTotal: toMajorCurrencyUnit(invoice.amountDue),
          ImpTotConc: 0,
          ImpNeto: toMajorCurrencyUnit(invoice.subtotal),
          ImpOpEx: 0,
          ImpIVA: toMajorCurrencyUnit(invoice.taxAmount),
          ImpTrib: 0,
          MonId: "PES",
          MonCotiz: 1,
          CondicionIVAReceptorId:
            RECEIVER_IVA_CONDITION[fiscalProfile.taxCondition],
          Iva: {
            AlicIva: [
              {
                Id: 5,
                BaseImp: toMajorCurrencyUnit(invoice.subtotal),
                Importe: toMajorCurrencyUnit(invoice.taxAmount),
              },
            ],
          },
        },
      },
    },
  };
}

async function generateAfipInvoice(
  invoice: InvoiceRow,
  fiscalProfile: CustomerFiscalProfile,
  runAt: Date,
): Promise<AfipInvoiceData> {
  logWorkflow("info", "Generating AFIP invoice", {
    invoiceId: invoice.id,
    invoiceType: fiscalProfile.invoiceType,
    runAt: runAt.toISOString(),
  });
  const config = getAfipConfig();
  const session = await initializeAfipSession(config, "wsfe");
  const voucherNumber = await getVoucherNumber(
    config,
    session,
    fiscalProfile.invoiceType,
  );
  const afipRequest = buildAfipIssueRequest(
    invoice,
    fiscalProfile,
    session,
    config,
    voucherNumber,
    runAt,
  );

  const data = await requestAfip(config, {
    method: "FECAESolicitar",
    wsid: "wsfe",
    params: afipRequest,
  });

  const detail =
    data?.FECAESolicitarResult?.FeDetResp?.FECAEDetResponse?.[0] ?? null;
  logWorkflow("info", "AFIP invoice detail received", {
    invoiceId: invoice.id,
    hasCAE: Boolean(detail?.CAE),
    hasInvoiceNumber: Boolean(detail?.CbteDesde),
    hasCaeDueDate: Boolean(detail?.CAEFchVto),
    resultCode: detail?.Resultado ?? null,
  });

  if (!detail?.CAE || !detail?.CbteDesde || !detail?.CAEFchVto) {
    throw new InvoiceWorkflowError("AFIP invoice generation failed");
  }

  return {
    invoiceNumber: Number(detail.CbteDesde),
    invoiceDate: String(detail.CbteFch),
    cae: String(detail.CAE),
    caeDueDate: String(detail.CAEFchVto),
  };
}

function buildPdfRequest(
  invoice: InvoiceRow,
  fiscalProfile: CustomerFiscalProfile,
  afipInvoice: {
    invoiceNumber: number;
    invoiceDate: string;
    cae: string | null;
    caeDueDate: string;
  },
  runAt: Date,
  config: PdfConfig,
): PdfRequestPayload {
  return {
    invoiceNumber: afipInvoice.invoiceNumber,
    invoiceDate: afipInvoice.invoiceDate,
    documentNumber: Number(fiscalProfile.taxId),
    titularName: fiscalProfile.businessName,
    ivaCondition: fiscalProfile.taxCondition,
    address: fiscalProfile.address,
    fromDate: formatDateForAfip(invoice.periodStart),
    duePaymentDate: formatDateForAfip(runAt),
    toDate: formatDateForAfip(invoice.periodEnd),
    dueDate: afipInvoice.caeDueDate,
    CAE: afipInvoice.cae,
    netPaid: toMajorCurrencyUnit(invoice.subtotal),
    totalPaid: toMajorCurrencyUnit(invoice.amountDue),
    taxPaid: toMajorCurrencyUnit(invoice.taxAmount),
    s3FileName: buildPdfFileName(
      Number(fiscalProfile.taxId),
      config.baseFilePath,
    ),
  };
}

async function generateInvoicePdf(
  invoice: InvoiceRow,
  fiscalProfile: CustomerFiscalProfile,
  afipInvoice: AfipInvoiceData,
  runAt: Date,
) {
  logWorkflow("info", "Generating invoice PDF", {
    invoiceId: invoice.id,
    afipInvoiceNumber: afipInvoice.invoiceNumber,
  });
  const config = getPdfConfig();
  const pdfRequest = buildPdfRequest(
    invoice,
    fiscalProfile,
    afipInvoice,
    runAt,
    config,
  );
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.bearerToken}`,
    },
    body: JSON.stringify(pdfRequest),
  });

  const data = await response.json();
  if (!response.ok || !data?.fileUrl) {
    logWorkflow("error", "Invoice PDF generation failed", {
      invoiceId: invoice.id,
      status: response.status,
      hasFileUrl: Boolean(data?.fileUrl),
    });
    throw new InvoiceWorkflowError("Invoice PDF generation failed");
  }

  logWorkflow("info", "Invoice PDF generated", {
    invoiceId: invoice.id,
    afipInvoiceNumber: afipInvoice.invoiceNumber,
  });
  return String(data.fileUrl);
}

async function buildIssuePreviewContext(
  invoice: InvoiceRow,
  runAt: Date,
): Promise<IssuePreviewContext> {
  logWorkflow("info", "Building issue preview context", {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
  });
  if (invoice.status !== "draft") {
    throw new InvoiceWorkflowError(
      `Invoice '${invoice.id}' is ${invoice.status} and cannot be issued`,
    );
  }

  const customer = await getCustomerRow(invoice.customerId);
  if (!customer) {
    throw new InvoiceWorkflowError(`No such customer: '${invoice.customerId}'`);
  }

  const subscription = await getSubscriptionRow(invoice.subscriptionId);
  if (!subscription) {
    throw new InvoiceWorkflowError(
      `No such subscription: '${invoice.subscriptionId}'`,
    );
  }

  const fiscalProfile = await loadCustomerFiscalProfile(customer);
  const afipConfig = getAfipConfig();
  const session = await initializeAfipSession(afipConfig, "wsfe");
  const voucherNumber = await getVoucherNumber(
    afipConfig,
    session,
    fiscalProfile.invoiceType,
  );
  const pdfConfig = getPdfConfig();
  const { paymentStatus, dueDate } = resolveIssueOutcome(
    invoice.collectionMethod,
    invoice.dueDate,
    runAt,
  );
  const estimatedInvoiceNumber = voucherNumber + 1;
  const afipRequest = buildAfipIssueRequest(
    invoice,
    fiscalProfile,
    session,
    afipConfig,
    voucherNumber,
    runAt,
  );
  const pdfRequest = buildPdfRequest(
    invoice,
    fiscalProfile,
    {
      invoiceNumber: estimatedInvoiceNumber,
      invoiceDate: afipRequest.FeCAEReq.FeDetReq.FECAEDetRequest.CbteFch,
      cae: null,
      caeDueDate: "PENDING_CAE_DUE_DATE",
    },
    runAt,
    pdfConfig,
  );

  logWorkflow("info", "Issue preview context built", {
    invoiceId: invoice.id,
    estimatedInvoiceNumber,
    expectedPaymentStatus: paymentStatus,
    dueDate: dueDate?.toISOString() ?? null,
  });
  return {
    subscription,
    fiscalProfile,
    paymentStatus,
    dueDate,
    estimatedInvoiceNumber,
    afipRequest,
    pdfRequest,
    warnings: [
      "El numero de comprobante estimado puede cambiar si otra emision ocurre antes del issue real.",
      "El preview no solicita CAE ni genera PDF; solo muestra el payload que se enviaria.",
      "CAE y CAE due date se completan recien cuando AFIP autoriza la emision real.",
    ],
  };
}

async function fetchPdfBase64(pdfUrl: string) {
  logWorkflow("info", "Downloading invoice PDF", {
    hasPdfUrl: Boolean(pdfUrl),
  });
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    logWorkflow("error", "Invoice PDF download failed", {
      status: response.status,
    });
    throw new InvoiceWorkflowError("Failed to download invoice PDF");
  }

  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

async function sendInvoiceEmail(
  invoice: InvoiceRow,
  recipient: string,
  pdfUrl: string,
) {
  logWorkflow("info", "Sending invoice email", {
    invoiceId: invoice.id,
    recipient: maskEmail(recipient),
  });
  const config = getEmailConfig();
  const attachment = await fetchPdfBase64(pdfUrl);
  const month = invoice.periodStart.getUTCMonth() + 1;
  const year = invoice.periodStart.getUTCFullYear();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [recipient],
      bcc: config.bcc.length > 0 ? config.bcc : undefined,
      subject: `${config.subjectPrefix} ${month}/${year}`,
      html: [
        "<div>",
        "<p>Buenos días,</p>",
        "<p>Gracias por elegir Talo para procesar los pagos por transferencia. Adjuntamos la factura emitida para este periodo.</p>",
        "<p>Saludos,</p>",
        "<p>El equipo de Talo</p>",
        "</div>",
      ].join(""),
      attachments: [
        {
          filename: `factura_${invoice.id}.pdf`,
          content: attachment,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok || data?.error) {
    logWorkflow("error", "Invoice email sending failed", {
      invoiceId: invoice.id,
      recipient: maskEmail(recipient),
      status: response.status,
      error: data?.error?.message ?? data?.message ?? null,
    });
    throw new InvoiceWorkflowError(
      data?.error?.message || data?.message || "Failed to send invoice email",
    );
  }
  logWorkflow("info", "Invoice email sent", {
    invoiceId: invoice.id,
    recipient: maskEmail(recipient),
  });
}

async function appendProcessedResult(
  result: InvoiceBatchResult,
  invoiceId: string,
) {
  const invoice = await getInvoice(invoiceId);
  result.processed_invoices += 1;
  result.results.push({
    invoice_id: invoiceId,
    status: "processed",
    invoice: invoice ?? undefined,
  });
}

function appendPreviewedResult(
  result: InvoiceIssuePreviewResult,
  preview: InvoiceIssuePreview,
) {
  result.previewed_invoices += 1;
  result.results.push({
    invoice_id: preview.invoice_id,
    status: "previewed",
    preview,
  });
}

function normalizePreviewPayloadAmounts(
  payloads: InvoiceIssuePreview["payloads"],
  invoice: InvoiceRow,
): InvoiceIssuePreview["payloads"] {
  const afipRequest = payloads.afip_request as {
    FeCAEReq?: {
      FeDetReq?: {
        FECAEDetRequest?: {
          ImpTotal?: number;
          ImpNeto?: number;
          ImpIVA?: number;
          Iva?: { AlicIva?: Array<{ BaseImp?: number; Importe?: number }> };
        };
      };
    };
  };
  const pdfRequest = payloads.pdf_request as {
    totalPaid?: number;
    netPaid?: number;
    taxPaid?: number;
  };

  if (afipRequest.FeCAEReq?.FeDetReq?.FECAEDetRequest) {
    afipRequest.FeCAEReq.FeDetReq.FECAEDetRequest.ImpTotal =
      toMajorCurrencyUnit(invoice.amountDue);
    afipRequest.FeCAEReq.FeDetReq.FECAEDetRequest.ImpNeto = toMajorCurrencyUnit(
      invoice.subtotal,
    );
    afipRequest.FeCAEReq.FeDetReq.FECAEDetRequest.ImpIVA = toMajorCurrencyUnit(
      invoice.taxAmount,
    );

    const alicIva =
      afipRequest.FeCAEReq.FeDetReq.FECAEDetRequest.Iva?.AlicIva?.[0];
    if (alicIva) {
      alicIva.BaseImp = toMajorCurrencyUnit(invoice.subtotal);
      alicIva.Importe = toMajorCurrencyUnit(invoice.taxAmount);
    }
  }

  pdfRequest.totalPaid = toMajorCurrencyUnit(invoice.amountDue);
  pdfRequest.netPaid = toMajorCurrencyUnit(invoice.subtotal);
  pdfRequest.taxPaid = toMajorCurrencyUnit(invoice.taxAmount);

  return payloads;
}

function appendFailedResult(
  result: InvoiceBatchResult,
  invoiceId: string,
  error: unknown,
) {
  result.failed_invoices += 1;
  result.results.push({
    invoice_id: invoiceId,
    status: "failed",
    message:
      error instanceof Error ? error.message : "Unknown invoice workflow error",
  });
}

function appendFailedPreviewResult(
  result: InvoiceIssuePreviewResult,
  invoiceId: string,
  error: unknown,
) {
  result.failed_invoices += 1;
  result.results.push({
    invoice_id: invoiceId,
    status: "failed",
    message:
      error instanceof Error ? error.message : "Unknown invoice preview error",
  });
}

async function issueInvoiceRow(invoice: InvoiceRow, runAt: Date) {
  logWorkflow("info", "Starting invoice issue", {
    invoiceId: invoice.id,
    runAt: runAt.toISOString(),
  });
  const preview = await buildIssuePreviewContext(invoice, runAt);
  const afipInvoice = await generateAfipInvoice(
    invoice,
    preview.fiscalProfile,
    runAt,
  );
  const pdfUrl = await generateInvoicePdf(
    invoice,
    preview.fiscalProfile,
    afipInvoice,
    runAt,
  );

  const legalDocument: InvoiceLegalDocument = {
    invoice_type: preview.fiscalProfile.invoiceType,
    document_number: Number(preview.fiscalProfile.taxId),
    invoice_number: afipInvoice.invoiceNumber,
    invoice_date: afipInvoice.invoiceDate,
    cae: afipInvoice.cae,
    cae_due_date: afipInvoice.caeDueDate,
    pdf_url: pdfUrl,
    receiver_name: preview.fiscalProfile.businessName,
    receiver_tax_id: preview.fiscalProfile.taxId,
    receiver_tax_condition: preview.fiscalProfile.taxCondition,
    receiver_address: preview.fiscalProfile.address,
  };

  await getDb().transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        status: "invoiced",
        paymentStatus: preview.paymentStatus,
        dueDate: preview.dueDate,
        invoicedAt: runAt,
        paidAt: preview.paymentStatus === "paid" ? runAt : null,
        legalDocument,
        updatedAt: runAt,
      })
      .where(eq(invoices.id, invoice.id));

    if (preview.subscription.status !== "canceled") {
      await tx
        .update(subscriptions)
        .set({
          currentPeriodStart: invoice.periodStart,
          currentPeriodEnd: invoice.periodEnd,
          renewalMode: resolveAdvancedRenewalMode(
            preview.subscription,
            invoice.periodEnd,
            runAt,
          ),
          status:
            preview.subscription.status === "past_due" ? "past_due" : "active",
          updatedAt: runAt,
        })
        .where(eq(subscriptions.id, preview.subscription.id));
    }
  });
  logWorkflow("info", "Invoice issued successfully", {
    invoiceId: invoice.id,
    invoiceNumber: afipInvoice.invoiceNumber,
    paymentStatus: preview.paymentStatus,
  });
}

async function sendInvoiceRow(invoice: InvoiceRow, runAt: Date) {
  logWorkflow("info", "Starting invoice send", {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    runAt: runAt.toISOString(),
  });
  if (invoice.status !== "invoiced") {
    throw new InvoiceWorkflowError(
      `Invoice '${invoice.id}' is ${invoice.status} and cannot be sent`,
    );
  }

  if (!invoice.legalDocument?.pdf_url) {
    throw new InvoiceWorkflowError(
      `Invoice '${invoice.id}' does not have an issued PDF`,
    );
  }

  const customer = await getCustomerRow(invoice.customerId);
  if (!customer) {
    throw new InvoiceWorkflowError(`No such customer: '${invoice.customerId}'`);
  }

  const recipient = customer.email?.trim();
  if (!recipient) {
    throw new InvoiceWorkflowError(
      `Customer '${customer.id}' is missing an email recipient`,
    );
  }

  await sendInvoiceEmail(invoice, recipient, invoice.legalDocument.pdf_url);

  await getDb().transaction(async (tx) => {
    await tx.insert(invoiceDeliveries).values({
      id: `idel_${crypto.randomUUID().replaceAll("-", "")}`,
      invoiceId: invoice.id,
      channel: "email",
      status: "sent",
      recipient,
      payload: {
        invoice_id: invoice.id,
        customer_id: invoice.customerId,
        subscription_id: invoice.subscriptionId,
        pdf_url: invoice.legalDocument?.pdf_url ?? null,
      },
      sentAt: runAt,
      createdAt: runAt,
      updatedAt: runAt,
    });

    await tx
      .update(invoices)
      .set({
        status: "sent",
        updatedAt: runAt,
      })
      .where(eq(invoices.id, invoice.id));
  });
  logWorkflow("info", "Invoice sent successfully", {
    invoiceId: invoice.id,
    recipient: maskEmail(recipient),
  });
}

export async function previewIssueInvoices(
  invoiceIds: string[],
  runAt = new Date(),
): Promise<InvoiceIssuePreviewResult> {
  await ensureTables();
  logWorkflow("info", "Starting invoice issue preview batch", {
    invoiceCount: invoiceIds.length,
    runAt: runAt.toISOString(),
  });

  const result = emptyPreviewResult();
  const rows = await loadSelectedInvoices(invoiceIds);

  for (const row of rows) {
    try {
      const preview = await buildIssuePreviewContext(row, runAt);
      appendPreviewedResult(result, {
        invoice_id: row.id,
        invoice_status: row.status,
        invoice_type: preview.fiscalProfile.invoiceType,
        receiver_name: preview.fiscalProfile.businessName,
        receiver_tax_id: preview.fiscalProfile.taxId,
        receiver_tax_condition: preview.fiscalProfile.taxCondition,
        receiver_address: preview.fiscalProfile.address,
        estimated_invoice_number: preview.estimatedInvoiceNumber,
        collection_method: row.collectionMethod,
        expected_payment_status: preview.paymentStatus,
        due_date: toUnix(preview.dueDate),
        warnings: preview.warnings,
        payloads: normalizePreviewPayloadAmounts(
          {
            afip_request: preview.afipRequest,
            pdf_request: preview.pdfRequest,
          },
          row,
        ),
      });
    } catch (error) {
      logWorkflow("error", "Invoice issue preview failed", {
        invoiceId: row.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      appendFailedPreviewResult(result, row.id, error);
      break;
    }
  }

  logWorkflow("info", "Finished invoice issue preview batch", {
    previewed: result.previewed_invoices,
    failed: result.failed_invoices,
  });
  return result;
}

export async function issueInvoices(
  invoiceIds: string[],
): Promise<InvoiceBatchResult> {
  await ensureTables();
  logWorkflow("info", "Preparing invoice issue batch", {
    invoiceCount: invoiceIds.length,
  });

  return runWithBillingLease("invoice_issue", async (runAt) => {
    logWorkflow("info", "Billing lease acquired for invoice issue", {
      runAt: runAt.toISOString(),
    });
    const result = emptyBatchResult("issue");
    const rows = await loadSelectedInvoices(invoiceIds);

    for (let i = 0; i < rows.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2000));
      const row = rows[i];
      try {
        await issueInvoiceRow(row, runAt);
        await appendProcessedResult(result, row.id);
      } catch (error) {
        logWorkflow("error", "Invoice issue failed", {
          invoiceId: row.id,
          error: error instanceof Error ? error.message : "unknown_error",
        });
        appendFailedResult(result, row.id, error);
        break;
      }
    }

    logWorkflow("info", "Finished invoice issue batch", {
      processed: result.processed_invoices,
      failed: result.failed_invoices,
    });
    return result;
  });
}

export async function sendInvoices(
  invoiceIds: string[],
): Promise<InvoiceBatchResult> {
  await ensureTables();
  logWorkflow("info", "Preparing invoice send batch", {
    invoiceCount: invoiceIds.length,
  });

  return runWithBillingLease("invoice_send", async (runAt) => {
    logWorkflow("info", "Billing lease acquired for invoice send", {
      runAt: runAt.toISOString(),
    });
    const result = emptyBatchResult("send");
    const rows = await loadSelectedInvoices(invoiceIds);

    for (const row of rows) {
      try {
        await sendInvoiceRow(row, runAt);
        await appendProcessedResult(result, row.id);
      } catch (error) {
        logWorkflow("error", "Invoice send failed", {
          invoiceId: row.id,
          error: error instanceof Error ? error.message : "unknown_error",
        });
        appendFailedResult(result, row.id, error);
        break;
      }
    }

    logWorkflow("info", "Finished invoice send batch", {
      processed: result.processed_invoices,
      failed: result.failed_invoices,
    });
    return result;
  });
}

export async function hasEmailDelivery(invoiceId: string) {
  logWorkflow("info", "Checking invoice email delivery", { invoiceId });
  const db = getDb();
  const rows = await db
    .select({ id: invoiceDeliveries.id })
    .from(invoiceDeliveries)
    .where(
      and(
        eq(invoiceDeliveries.invoiceId, invoiceId),
        eq(invoiceDeliveries.channel, "email"),
      ),
    )
    .limit(1);

  logWorkflow("info", "Invoice email delivery check completed", {
    invoiceId,
    delivered: Boolean(rows[0]),
  });
  return Boolean(rows[0]);
}
