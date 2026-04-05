import { and, desc, eq, gt, lt } from "drizzle-orm";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import {
  invoiceDeliveries,
  invoices,
} from "@/infrastructure/database/schema";
import { toUnix } from "@/modules/shared/time";
import type {
  Invoice,
  InvoiceDelivery,
  ListInvoicesParams,
  StripeInvoiceList,
} from "./types";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceDeliveryRow = typeof invoiceDeliveries.$inferSelect;

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
  organizationId: string,
  invoiceId: string
): Promise<InvoiceDelivery | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoiceDeliveries)
    .where(
      and(
        eq(invoiceDeliveries.organizationId, organizationId),
        eq(invoiceDeliveries.invoiceId, invoiceId)
      )
    )
    .orderBy(desc(invoiceDeliveries.createdAt), desc(invoiceDeliveries.id))
    .limit(1);

  return rows[0] ? toInvoiceDelivery(rows[0]) : null;
}

async function toInvoice(
  organizationId: string,
  row: InvoiceRow
): Promise<Invoice> {
  return {
    id: row.id,
    object: "invoice",
    customer: row.customerId,
    subscription: row.subscriptionId,
    status: row.status,
    collection_method: row.collectionMethod,
    currency: row.currency,
    subtotal: row.subtotal,
    amount_due: row.amountDue,
    amount_paid: row.amountPaid,
    due_date: toUnix(row.dueDate),
    period_start: Math.floor(row.periodStart.getTime() / 1000),
    period_end: Math.floor(row.periodEnd.getTime() / 1000),
    auto_advance: row.autoAdvance,
    finalized_at: toUnix(row.finalizedAt),
    paid_at: toUnix(row.paidAt),
    latest_delivery: await getLatestDelivery(organizationId, row.id),
    created: Math.floor(row.createdAt.getTime() / 1000),
    updated: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export async function getInvoice(
  organizationId: string,
  invoiceId: string
): Promise<Invoice | null> {
  await ensureTables();
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoiceId))
    )
    .limit(1);

  return rows[0] ? toInvoice(organizationId, rows[0]) : null;
}

export async function listInvoices(
  organizationId: string,
  params: ListInvoicesParams
): Promise<StripeInvoiceList> {
  await ensureTables();
  const db = getDb();
  const limit = params.limit ?? 10;
  const conditions = [
    eq(invoices.organizationId, organizationId),
    eq(invoices.customerId, params.customer),
  ];

  if (params.starting_after) {
    const cursor = await db
      .select({ createdAt: invoices.createdAt })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, params.starting_after)
        )
      )
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(lt(invoices.createdAt, cursor[0].createdAt));
    }
  }

  if (params.ending_before) {
    const cursor = await db
      .select({ createdAt: invoices.createdAt })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, params.ending_before)
        )
      )
      .limit(1);

    if (cursor.length > 0) {
      conditions.push(gt(invoices.createdAt, cursor[0].createdAt));
    }
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = await Promise.all(
    rows.slice(0, limit).map((row) => toInvoice(organizationId, row))
  );

  return {
    object: "list",
    data,
    has_more: hasMore,
    url: "/api/invoices",
  };
}
