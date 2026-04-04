import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  defaultPriceId: text("default_price_id"),
  description: text("description"),
  metadata: jsonb("metadata")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  livemode: boolean("livemode").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const prices = pgTable("prices", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  productId: text("product_id").notNull(),
  active: boolean("active").default(true).notNull(),
  billingScheme: text("billing_scheme").notNull(),
  currency: text("currency").notNull(),
  nickname: text("nickname"),
  metadata: jsonb("metadata")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  livemode: boolean("livemode").default(false).notNull(),
  type: text("type").$type<"one_time" | "recurring">().notNull(),
  unitAmount: integer("unit_amount").notNull(),
  recurringInterval: text("recurring_interval").$type<"month" | "year" | null>(),
  recurringIntervalCount: integer("recurring_interval_count").$type<1 | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name"),
  email: text("email"),
  description: text("description"),
  metadata: jsonb("metadata")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  livemode: boolean("livemode").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  customerId: text("customer_id"),
  type: text("type").$type<"custom">().notNull(),
  customType: text("custom_type").notNull(),
  billingName: text("billing_name"),
  livemode: boolean("livemode").default(false).notNull(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  customerId: text("customer_id").notNull(),
  status: text("status").$type<"active" | "past_due" | "canceled">().notNull(),
  collectionMethod: text("collection_method")
    .$type<"charge_automatically" | "send_invoice">()
    .notNull(),
  defaultPaymentMethodId: text("default_payment_method_id"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  livemode: boolean("livemode").default(false).notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
    .notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptionItems = pgTable("subscription_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  priceId: text("price_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  customerId: text("customer_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  status: text("status").$type<"draft" | "open" | "paid" | "past_due">().notNull(),
  collectionMethod: text("collection_method")
    .$type<"charge_automatically" | "send_invoice">()
    .notNull(),
  currency: text("currency").notNull(),
  subtotal: integer("subtotal").notNull(),
  amountDue: integer("amount_due").notNull(),
  amountPaid: integer("amount_paid").default(0).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  autoAdvance: boolean("auto_advance").default(true).notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  priceId: text("price_id").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoiceDeliveries = pgTable("invoice_deliveries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  channel: text("channel").$type<"mock_email">().notNull(),
  status: text("status").$type<"pending" | "sent">().notNull(),
  recipient: text("recipient"),
  payload: jsonb("payload")
    .$type<Record<string, string | null>>()
    .default({})
    .notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const billingProcessorState = pgTable("billing_processor_state", {
  id: text("id").primaryKey(),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastSummary: jsonb("last_summary")
    .$type<Record<string, number | string | null>>()
    .default({})
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
