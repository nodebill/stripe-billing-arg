import { z } from "zod/v4";

function stripeLikeIdRegex(prefix: string) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]+$`);
}

export function stripeIdSchema(prefix: string, label: string) {
  return z
    .string()
    .regex(stripeLikeIdRegex(prefix), `${label} must be a valid ${prefix}_ id`);
}

export const customerIdSchema = stripeIdSchema("cus", "Customer");
export const productIdSchema = stripeIdSchema("prod", "Product");
export const priceIdSchema = stripeIdSchema("price", "Price");
export const paymentMethodIdSchema = stripeIdSchema("pm", "Payment method");
export const subscriptionIdSchema = stripeIdSchema("sub", "Subscription");
export const invoiceIdSchema = stripeIdSchema("in", "Invoice");
