import { and, desc, eq, gt, lt } from "drizzle-orm";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  invoiceDeliveries,
  invoiceLineItems,
  invoices,
} from "@/infrastructure/database/schema";
import { toUnix } from "@/modules/shared/time";
import type {
  Invoice,
  InvoiceDetail,
  InvoiceDelivery,
  InvoiceLineItem,
  ListInvoicesParams,
  StripeInvoiceList,
} from "./types";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceDeliveryRow = typeof invoiceDeliveries.$inferSelect;
type InvoiceLineItemRow = typeof invoiceLineItems.$inferSelect;

function toInvoiceDelivery(row: InvoiceDeliveryRow): InvoiceDelivery {
  return {
    id: row.id,
    object: "invoice_delivery",
    channel: row.channel,
    status: row.status,
    recipient: row.recipient,
    sent_at: toUnix(row.sentAt),
    payload: row.payload,
  };
}

async function getLatestDelivery(
  invoiceId: string
): Promise<InvoiceDelivery | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoiceDeliveries)
    .where(eq(invoiceDeliveries.invoiceId, invoiceId))
    .orderBy(desc(invoiceDeliveries.createdAt), desc(invoiceDeliveries.id))
    .limit(1);

  return rows[0] ? toInvoiceDelivery(rows[0]) : null;
}

function toInvoiceLineItem(row: InvoiceLineItemRow): InvoiceLineItem {
  return {
    id: row.id,
    object: "invoice_line_item",
    price: row.priceId,
    billing_reason: row.billingReason,
    quantity: row.quantity,
    amount: row.amount,
    currency: row.currency,
    period_start: Math.floor(row.periodStart.getTime() / 1000),
    period_end: Math.floor(row.periodEnd.getTime() / 1000),
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function listInvoiceLineItems(invoiceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(invoiceLineItems.periodStart, invoiceLineItems.createdAt, invoiceLineItems.id);

  return rows.map(toInvoiceLineItem);
}

async function toInvoiceSummary(
  row: InvoiceRow
): Promise<Invoice> {
  return {
    id: row.id,
    object: "invoice",
    customer: row.customerId,
    subscription: row.subscriptionId,
    status: row.status,
    payment_status: row.paymentStatus,
    collection_method: row.collectionMethod,
    currency: row.currency,
    subtotal: row.subtotal,
    tax_amount: row.taxAmount,
    amount_due: row.amountDue,
    amount_paid: row.amountPaid,
    due_date: toUnix(row.dueDate),
    period_start: Math.floor(row.periodStart.getTime() / 1000),
    period_end: Math.floor(row.periodEnd.getTime() / 1000),
    auto_advance: row.autoAdvance,
    invoiced_at: toUnix(row.invoicedAt),
    paid_at: toUnix(row.paidAt),
    legal_document: row.legalDocument ?? null,
    latest_delivery: await getLatestDelivery(row.id),
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

async function toInvoiceDetail(
  row: InvoiceRow
): Promise<InvoiceDetail> {
  const invoice = await toInvoiceSummary(row);
  return {
    ...invoice,
    line_items: await listInvoiceLineItems(row.id),
  };
}

export async function getInvoice(
  invoiceId: string
): Promise<InvoiceDetail | null> {
  await ensureTables();
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  return rows[0] ? toInvoiceDetail(rows[0]) : null;
}

export async function listInvoices(
  params: ListInvoicesParams
): Promise<StripeInvoiceList> {
  await ensureTables();
  const db = getDb();
  const limit = params.limit ?? 10;
  const conditions = [];

  if (params.customer) {
    conditions.push(eq(invoices.customerId, params.customer));
  }

  if (params.status) {
    conditions.push(eq(invoices.status, params.status));
  }

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: invoices.createdAt })
      .from(invoices)
      .where(eq(invoices.id, params.starting_after))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(invoices.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: invoices.createdAt })
      .from(invoices)
      .where(eq(invoices.id, params.ending_before))
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(invoices.createdAt, cursor[0].createdAt));
    }
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(invoices)
          .where(and(...conditions))
          .orderBy(desc(invoices.createdAt), desc(invoices.id))
          .limit(limit + 1)
      : await db
          .select()
          .from(invoices)
          .orderBy(desc(invoices.createdAt), desc(invoices.id))
          .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = await Promise.all(
    rows.slice(0, limit).map((row) => toInvoiceSummary(row))
  );

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/invoices",
  };
}
