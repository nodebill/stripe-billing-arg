import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
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

export const meterEvents = pgTable(
  "meter_events",
  {
    id: text("id").primaryKey(),
    meterId: text("meter_id").notNull(),
    customerId: text("customer_id").notNull(),
    identifier: text("identifier").notNull(),
    eventName: text("event_name").notNull(),
    value: integer("value").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true })
      .notNull(),
    invoiceLineItemId: text("invoice_line_item_id"),
    livemode: boolean("livemode").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("meter_events_identifier_idx").on(table.identifier),
    index("meter_events_meter_customer_timestamp_idx").on(
      table.meterId,
      table.customerId,
      table.eventTimestamp
    ),
  ]
);

export const prices = pgTable("prices", {
  id: text("id").primaryKey(),
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
  unitAmount: integer("unit_amount"),
  unitAmountDecimal: text("unit_amount_decimal").notNull(),
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
  name: text("name"),
  email: text("email"),
  description: text("description"),
  metadata: jsonb("metadata")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  address:
    jsonb("address").$type<{
      line1: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    } | null>(),
  taxId:
    jsonb("tax_id").$type<{
      id: string;
      type: string;
      value: string;
      customer: string;
      created: number;
    } | null>(),
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
  customerId: text("customer_id").notNull(),
  status: text("status").$type<"active" | "past_due" | "canceled">().notNull(),
  renewalMode: text("renewal_mode")
    .$type<"automatic" | "manual_until_current">()
    .default("automatic")
    .notNull(),
  collectionMethod: text("collection_method")
    .$type<"charge_automatically" | "send_invoice">()
    .notNull(),
  defaultPaymentMethodId: text("default_payment_method_id"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  livemode: boolean("livemode").default(false).notNull(),
  billingAnchorStart: timestamp("billing_anchor_start", { withTimezone: true })
    .notNull(),
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
  subscriptionId: text("subscription_id").notNull(),
  priceId: text("price_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    status: text("status")
      .$type<"draft" | "open" | "paid" | "past_due">()
      .notNull(),
    collectionMethod: text("collection_method")
      .$type<"charge_automatically" | "send_invoice">()
      .notNull(),
    currency: text("currency").notNull(),
    subtotal: integer("subtotal").notNull(),
    taxAmount: integer("tax_amount").default(0).notNull(),
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
  },
  (table) => [
    uniqueIndex("invoices_subscription_period_idx").on(
      table.subscriptionId,
      table.periodStart,
      table.periodEnd
    ),
  ]
);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  priceId: text("price_id").notNull(),
  billingReason: text("billing_reason")
    .$type<"licensed_recurring" | "metered_recurring" | "metered_carryforward">()
    .notNull(),
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

export const subscriptionSchedules = pgTable(
  "subscription_schedules",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    baselinePriceId: text("baseline_price_id").notNull(),
    status: text("status")
      .$type<
        "not_started" | "active" | "completed" | "canceled" | "released"
      >()
      .notNull(),
    endBehavior: text("end_behavior")
      .$type<"release" | "cancel">()
      .notNull(),
    currentPhaseId: text("current_phase_id"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    livemode: boolean("livemode").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscription_schedules_subscription_id_idx").on(
      table.subscriptionId
    ),
  ]
);

export const subscriptionSchedulePhases = pgTable(
  "subscription_schedule_phases",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id").notNull(),
    priceId: text("price_id").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    orderIndex: integer("order_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscription_schedule_phases_schedule_order_idx").on(
      table.scheduleId,
      table.orderIndex
    ),
  ]
);

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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const apikey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(3600000),
    rateLimitMax: integer("rate_limit_max").default(1000),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_config_id_idx").on(table.configId),
    index("apikey_reference_id_idx").on(table.referenceId),
    index("apikey_key_idx").on(table.key),
  ]
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const teamInvites = pgTable(
  "team_invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").$type<"admin" | "user">().notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("team_invites_token_hash_idx").on(table.tokenHash),
    index("team_invites_email_idx").on(table.email),
    index("team_invites_created_by_user_id_idx").on(table.createdByUserId),
  ]
);
