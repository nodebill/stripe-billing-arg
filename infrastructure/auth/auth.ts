import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { getDb } from "@/infrastructure/database/client";

export const MACHINE_API_KEY_CONFIG_ID = "machine";

function normalizeHost(host: string) {
  return host
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function getSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  return "local-dev-auth-secret-change-me";
}

function getAllowedHosts() {
  const hosts = new Set<string>(["localhost:3000", "127.0.0.1:3000"]);
  const productionHost = process.env.BETTER_AUTH_PRODUCTION_HOST?.trim();
  const extraHosts = process.env.BETTER_AUTH_ALLOWED_HOSTS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (productionHost) {
    hosts.add(normalizeHost(productionHost));
  }

  for (const host of extraHosts ?? []) {
    hosts.add(normalizeHost(host));
  }

  return [...hosts];
}

function getFallbackURL() {
  const explicitBaseURL = process.env.BETTER_AUTH_URL?.trim();
  if (explicitBaseURL) {
    return explicitBaseURL;
  }

  const productionHost = process.env.BETTER_AUTH_PRODUCTION_HOST?.trim();
  if (productionHost) {
    return `https://${normalizeHost(productionHost)}`;
  }

  return "http://localhost:3000";
}

function getTrustedOrigins() {
  const origins = new Set<string>();
  const extraOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of extraOrigins ?? []) {
    origins.add(origin);
  }

  return [...origins];
}

export const auth = betterAuth({
  appName: "Pentos",
  baseURL: {
    allowedHosts: getAllowedHosts(),
    fallback: getFallbackURL(),
    protocol: process.env.NODE_ENV === "development" ? "http" : "https",
  },
  secret: getSecret(),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
  }),
  trustedOrigins: getTrustedOrigins(),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      strategy: "compact",
    },
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    storage: "database",
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 10,
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    disableCSRFCheck: false,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    apiKey(
      [
        {
          configId: MACHINE_API_KEY_CONFIG_ID,
          apiKeyHeaders: ["x-api-key"],
          defaultPrefix: "pnt_",
          rateLimit: {
            enabled: true,
            maxRequests: 1000,
            timeWindow: 1000 * 60 * 60,
          },
        },
      ]
    ),
    nextCookies(),
  ],
});
