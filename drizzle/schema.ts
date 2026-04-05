import { pgTable, text, boolean, jsonb, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const products = pgTable("products", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	name: text().notNull(),
	active: boolean().default(true).notNull(),
	description: text(),
	metadata: jsonb().default({}).notNull(),
	livemode: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	defaultPriceId: text("default_price_id"),
});

export const prices = pgTable("prices", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	productId: text("product_id").notNull(),
	active: boolean().default(true).notNull(),
	billingScheme: text("billing_scheme").notNull(),
	currency: text().notNull(),
	nickname: text(),
	metadata: jsonb().default({}).notNull(),
	livemode: boolean().default(false).notNull(),
	type: text().notNull(),
	unitAmount: integer("unit_amount"),
	unitAmountDecimal: text("unit_amount_decimal").notNull(),
	recurringInterval: text("recurring_interval"),
	recurringIntervalCount: integer("recurring_interval_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	meter: text(),
});

export const customers = pgTable("customers", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	name: text(),
	email: text(),
	description: text(),
	metadata: jsonb().default({}).notNull(),
	livemode: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	customerId: text("customer_id"),
	type: text().notNull(),
	customType: text("custom_type").notNull(),
	billingName: text("billing_name"),
	livemode: boolean().default(false).notNull(),
	detachedAt: timestamp("detached_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const subscriptionItems = pgTable("subscription_items", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	subscriptionId: text("subscription_id").notNull(),
	priceId: text("price_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	customerId: text("customer_id").notNull(),
	status: text().notNull(),
	defaultPaymentMethodId: text("default_payment_method_id"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	canceledAt: timestamp("canceled_at", { withTimezone: true, mode: 'string' }),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	livemode: boolean().default(false).notNull(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }).notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	collectionMethod: text("collection_method"),
});

export const invoices = pgTable("invoices", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	customerId: text("customer_id").notNull(),
	subscriptionId: text("subscription_id").notNull(),
	status: text().notNull(),
	collectionMethod: text("collection_method").notNull(),
	currency: text().notNull(),
	subtotal: integer().notNull(),
	amountDue: integer("amount_due").notNull(),
	amountPaid: integer("amount_paid").default(0).notNull(),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	periodStart: timestamp("period_start", { withTimezone: true, mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { withTimezone: true, mode: 'string' }).notNull(),
	autoAdvance: boolean("auto_advance").default(true).notNull(),
	finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: 'string' }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("invoices_subscription_period_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.subscriptionId.asc().nullsLast().op("text_ops"), table.periodStart.asc().nullsLast().op("text_ops"), table.periodEnd.asc().nullsLast().op("text_ops")),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	invoiceId: text("invoice_id").notNull(),
	priceId: text("price_id").notNull(),
	quantity: integer().default(1).notNull(),
	amount: integer().notNull(),
	currency: text().notNull(),
	periodStart: timestamp("period_start", { withTimezone: true, mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const invoiceDeliveries = pgTable("invoice_deliveries", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	invoiceId: text("invoice_id").notNull(),
	channel: text().notNull(),
	status: text().notNull(),
	recipient: text(),
	payload: jsonb().default({}).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const billingProcessorState = pgTable("billing_processor_state", {
	id: text().primaryKey().notNull(),
	leaseOwner: text("lease_owner"),
	leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: 'string' }),
	lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: 'string' }),
	lastFinishedAt: timestamp("last_finished_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
	lastSummary: jsonb("last_summary").default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const meters = pgTable("meters", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	displayName: text("display_name").notNull(),
	eventName: text("event_name").notNull(),
	defaultAggregation: text("default_aggregation").notNull(),
	status: text().default('active').notNull(),
	livemode: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const meterEvents = pgTable("meter_events", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	meterId: text("meter_id").notNull(),
	customerId: text("customer_id").notNull(),
	identifier: text().notNull(),
	eventName: text("event_name").notNull(),
	value: integer().notNull(),
	eventTimestamp: timestamp("event_timestamp", { withTimezone: true, mode: 'string' }).notNull(),
	livemode: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
