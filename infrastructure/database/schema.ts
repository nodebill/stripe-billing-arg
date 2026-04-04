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

export const meters = pgTable("meters", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  displayName: text("display_name").notNull(),
  eventName: text("event_name").notNull(),
  defaultAggregation: text("default_aggregation")
    .$type<"sum" | "count">()
    .notNull(),
  status: text("status")
    .$type<"active" | "inactive">()
    .default("active")
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
  meter: text("meter"),
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
  status: text("status").$type<"active" | "canceled">().notNull(),
  defaultPaymentMethodId: text("default_payment_method_id").notNull(),
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
