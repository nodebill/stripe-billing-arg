import assert from "node:assert/strict";
import test from "node:test";
import { desc, eq } from "drizzle-orm";
import { ensureTables, getDb } from "../infrastructure/database/client";
import {
  billingProcessorState,
  customers,
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
  paymentMethods,
  prices,
  products,
  subscriptionItems,
  subscriptions,
} from "../infrastructure/database/schema";
import {
  issueInvoices,
  previewIssueInvoices,
  sendInvoices,
} from "../modules/invoices/workflow";
import { getInvoice } from "../modules/invoices/service";
import {
  attachPaymentMethod,
  createPaymentMethod,
} from "../modules/payment-methods/service";
import { createPrice } from "../modules/prices/service";
import { createProduct } from "../modules/products/service";
import { createCustomer } from "../modules/customers/service";
import { createSubscription } from "../modules/subscriptions/service";

const originalFetch = globalThis.fetch;
const runtime = globalThis as typeof globalThis & {
  __stripeBillingPGlite?: { close: () => Promise<void> };
  __stripeBillingPool?: { end: () => Promise<void> };
};

async function resetDb() {
  await ensureTables();
  const db = getDb();

  await db.delete(invoiceDeliveries);
  await db.delete(invoiceLineItems);
  await db.delete(invoices);
  await db.delete(subscriptionItems);
  await db.delete(subscriptions);
  await db.delete(paymentMethods);
  await db.delete(prices);
  await db.delete(products);
  await db.delete(customers);
  await db.delete(billingProcessorState);
}

async function createArsDraftInvoiceFixture(options?: {
  taxId?: string;
  collectionMethod?: "charge_automatically" | "send_invoice";
}) {
  const customer = await createCustomer({
    email: `billing-${Date.now()}@example.com`,
    taxId: {
      type: "ar_cuit",
      value: options?.taxId ?? "20-12345678-9",
    },
  });
  const paymentMethod = await createPaymentMethod({
    type: "custom",
    billing_details: {
      name: "Primary method",
    },
  });
  await attachPaymentMethod(paymentMethod.id, {
    customer: customer.id,
  });

  const product = await createProduct({
    name: `Factura ${Date.now()}`,
  });
  const price = await createPrice({
    product: product.id,
    currency: "ars",
    unit_amount: 2500,
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
  });

  if (!price || "error" in price) {
    throw new Error("Expected ARS recurring price fixture to be created");
  }

  await createSubscription({
    customer: customer.id,
    default_payment_method: paymentMethod.id,
    collection_method: options?.collectionMethod ?? "charge_automatically",
    billing_cycle_anchor_config: {
      day_of_month: 1,
    },
    proration_behavior: "create_prorations",
    items: [{ price: price.id }],
  });

  const invoiceRows = await getDb()
    .select()
    .from(invoices)
    .where(eq(invoices.customerId, customer.id))
    .orderBy(desc(invoices.createdAt), desc(invoices.id));
  const invoiceRow = invoiceRows[0];
  if (!invoiceRow) {
    throw new Error("Expected draft invoice fixture");
  }

  return { customer, invoiceId: invoiceRow.id };
}

function setWorkflowEnv() {
  process.env.AFIP_AUTH_TOKEN = "afip_token";
  process.env.AFIP_AUTH_CERT = "cert";
  process.env.AFIP_AUTH_KEY = "key";
  process.env.TALO_CUIT = "30712345678";
  process.env.INVOICE_PDF_ENDPOINT = "https://pdf.example/render";
  process.env.INVOICE_PDF_BEARER_TOKEN = "pdf_token";
  process.env.RESEND_API_KEY = "resend_token";
  process.env.INVOICE_EMAIL_FROM = "billing@example.com";
}

function installWorkflowFetchMock(options?: { personaReturn?: Record<string, unknown> }) {
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.endsWith("/auth")) {
      return Response.json({
        token: "sdk_token",
        sign: "sdk_sign",
      });
    }

    if (url.endsWith("/requests") && body?.method === "getPersona_v2") {
      return Response.json({
        personaReturn:
          options?.personaReturn ?? {
            datosGenerales: {
              razonSocial: "Acme SA",
            },
            domicilioFiscal: {
              direccion: "Calle 123",
              localidad: "CABA",
              descripcionProvincia: "Buenos Aires",
              codPostal: "1000",
            },
            datosRegimenGeneral: {
              impuesto: [{ id: 30 }],
            },
          },
      });
    }

    if (url.endsWith("/requests") && body?.method === "FECompUltimoAutorizado") {
      return Response.json({
        FECompUltimoAutorizadoResult: {
          CbteNro: 100,
        },
      });
    }

    if (url.endsWith("/requests") && body?.method === "FECAESolicitar") {
      return Response.json({
        FECAESolicitarResult: {
          FeDetResp: {
            FECAEDetResponse: [
              {
                CAE: "12345678901234",
                CbteDesde: 101,
                CbteFch: "20260430",
                CAEFchVto: "20260510",
              },
            ],
          },
        },
      });
    }

    if (url === "https://pdf.example/render") {
      return Response.json({
        fileUrl: "https://pdf.example/file.pdf",
      });
    }

    if (url === "https://pdf.example/file.pdf") {
      return new Response("fake-pdf", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }

    if (url === "https://api.resend.com/emails") {
      return Response.json({
        id: "email_123",
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof globalThis.fetch;
}

function restoreWorkflowTestState() {
  globalThis.fetch = originalFetch;
  delete process.env.AFIP_AUTH_TOKEN;
  delete process.env.AFIP_AUTH_CERT;
  delete process.env.AFIP_AUTH_KEY;
  delete process.env.TALO_CUIT;
  delete process.env.INVOICE_PDF_ENDPOINT;
  delete process.env.INVOICE_PDF_BEARER_TOKEN;
  delete process.env.RESEND_API_KEY;
  delete process.env.INVOICE_EMAIL_FROM;
}

test("issueInvoices legally issues a draft invoice and stores the legal document", async () => {
  await resetDb();
  setWorkflowEnv();
  installWorkflowFetchMock();

  try {
    const fixture = await createArsDraftInvoiceFixture();

    const result = await issueInvoices([fixture.invoiceId]);
    assert.equal(result.processed_invoices, 1);
    assert.equal(result.failed_invoices, 0);

    const invoice = await getInvoice(fixture.invoiceId);
    assert.ok(invoice);
    assert.equal(invoice.status, "invoiced");
    assert.equal(invoice.payment_status, "paid");
    assert.equal(invoice.legal_document?.invoice_number, 101);
    assert.equal(invoice.legal_document?.receiver_name, "Acme SA");
    assert.equal(invoice.legal_document?.pdf_url, "https://pdf.example/file.pdf");
  } finally {
    restoreWorkflowTestState();
  }
});

test("previewIssueInvoices shows the payloads without issuing and falls back juridical CUITs to RI", async () => {
  await resetDb();
  setWorkflowEnv();
  installWorkflowFetchMock({
    personaReturn: {
      datosGenerales: {
        razonSocial: "Empresa SA",
      },
      domicilioFiscal: {
        direccion: "Calle 456",
        localidad: "CABA",
        descripcionProvincia: "Buenos Aires",
        codPostal: "1000",
      },
    },
  });

  try {
    const fixture = await createArsDraftInvoiceFixture({
      taxId: "30-12345678-9",
      collectionMethod: "send_invoice",
    });

    const result = await previewIssueInvoices([fixture.invoiceId]);
    assert.equal(result.previewed_invoices, 1);
    assert.equal(result.failed_invoices, 0);

    const preview = result.results[0]?.preview;
    assert.ok(preview);
    assert.equal(preview.receiver_tax_condition, "RESPONSABLE_INSCRIPTO");
    assert.equal(preview.invoice_type, "FACTURA_A");
    assert.equal(preview.expected_payment_status, "pending");
    assert.equal(
      (
        preview.payloads.afip_request.FeCAEReq as {
          FeDetReq: { FECAEDetRequest: { CondicionIVAReceptorId: number } };
        }
      ).FeDetReq.FECAEDetRequest.CondicionIVAReceptorId,
      1
    );

    const invoice = await getInvoice(fixture.invoiceId);
    assert.ok(invoice);
    assert.equal(invoice.status, "draft");
    assert.equal(invoice.legal_document, null);
  } finally {
    restoreWorkflowTestState();
  }
});

test("sendInvoices emails an already issued invoice and records an email delivery", async () => {
  await resetDb();
  setWorkflowEnv();
  installWorkflowFetchMock();

  try {
    const fixture = await createArsDraftInvoiceFixture();
    await issueInvoices([fixture.invoiceId]);

    const result = await sendInvoices([fixture.invoiceId]);
    assert.equal(result.processed_invoices, 1);
    assert.equal(result.failed_invoices, 0);

    const invoice = await getInvoice(fixture.invoiceId);
    assert.ok(invoice);
    assert.equal(invoice.status, "sent");
    assert.equal(invoice.latest_delivery?.channel, "email");
    assert.equal(invoice.latest_delivery?.status, "sent");

    const deliveryRows = await getDb()
      .select()
      .from(invoiceDeliveries)
      .where(eq(invoiceDeliveries.invoiceId, fixture.invoiceId));
    assert.equal(deliveryRows.length, 1);
  } finally {
    restoreWorkflowTestState();
  }
});

test("issueInvoices stops at the first error and leaves later invoices untouched", async () => {
  await resetDb();
  setWorkflowEnv();
  installWorkflowFetchMock();

  try {
    const first = await createArsDraftInvoiceFixture();
    const second = await createArsDraftInvoiceFixture();
    await getDb()
      .update(invoices)
      .set({
        createdAt: new Date("2026-04-09T10:00:00.000Z"),
        updatedAt: new Date("2026-04-09T10:00:00.000Z"),
      })
      .where(eq(invoices.id, first.invoiceId));
    await getDb()
      .update(invoices)
      .set({
        createdAt: new Date("2026-04-09T11:00:00.000Z"),
        updatedAt: new Date("2026-04-09T11:00:00.000Z"),
      })
      .where(eq(invoices.id, second.invoiceId));
    await getDb()
      .update(customers)
      .set({
        taxId: null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, second.customer.id));

    const result = await issueInvoices([first.invoiceId, second.invoiceId]);
    assert.equal(result.processed_invoices, 1);
    assert.equal(result.failed_invoices, 1);
    assert.equal(result.results[1]?.status, "failed");

    const secondInvoice = await getInvoice(second.invoiceId);
    assert.ok(secondInvoice);
    assert.equal(secondInvoice.status, "draft");
    assert.equal(secondInvoice.legal_document, null);
  } finally {
    restoreWorkflowTestState();
  }
});

test.after(async () => {
  restoreWorkflowTestState();
  await runtime.__stripeBillingPool?.end();
  runtime.__stripeBillingPool = undefined;
  await runtime.__stripeBillingPGlite?.close();
  runtime.__stripeBillingPGlite = undefined;
});
