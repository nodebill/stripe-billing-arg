import { asc, eq } from "drizzle-orm";
import { bootstrapFirstAdmin, hasAnyAuthUsers } from "@/infrastructure/auth";
import { ensureTables, getDb } from "@/infrastructure/database/client";
import { meters, products, user } from "@/infrastructure/database/schema";
import { createMeter, getMeter } from "@/modules/meters/service";
import { createProduct, getProduct, updateProduct } from "@/modules/products/service";
import { bootstrapManifest } from "./manifest";
import type {
  BootstrapAdminInput,
  BootstrapAdminResult,
  BootstrapAdminSummary,
  BootstrapCatalogItemResult,
  BootstrapCatalogResult,
  BootstrapManifest,
  BootstrapManifestMeter,
  BootstrapManifestProduct,
  BootstrapSeedResult,
} from "./types";

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>
) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(
    ([key, value], index) =>
      rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value
  );
}

function normalizeAdminInput(input?: BootstrapAdminInput | null) {
  if (!input) {
    return null;
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;

  if (!email || !name || !password) {
    return null;
  }

  return {
    email,
    name,
    password,
  };
}

async function findAdminUsers() {
  await ensureTables();
  const db = getDb();
  return db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id));
}

function toAdminSummary(row: {
  id: string;
  email: string;
  name: string;
  role: string | null;
}): BootstrapAdminSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

async function ensureAdmin(
  input?: BootstrapAdminInput | null
): Promise<BootstrapAdminResult & { warnings: string[] }> {
  const normalizedInput = normalizeAdminInput(input);
  const warnings: string[] = [];

  if (!(await hasAnyAuthUsers())) {
    if (!normalizedInput) {
      throw new Error(
        "Admin credentials are required when the auth database is empty"
      );
    }

    await bootstrapFirstAdmin(normalizedInput);
    const users = await findAdminUsers();
    const createdUser = users.find(
      (entry) => entry.email.toLowerCase() === normalizedInput.email
    );

    if (!createdUser) {
      throw new Error("Bootstrap admin was created but could not be reloaded");
    }

    return {
      status: "created",
      user: toAdminSummary(createdUser),
      warnings,
    };
  }

  const users = await findAdminUsers();
  if (users.length === 0) {
    throw new Error(
      "Auth users were reported as existing, but no user rows were found"
    );
  }

  const adminUser = users.find((entry) => entry.role === "admin");
  if (!adminUser) {
    throw new Error(
      "Auth users already exist, but none have the admin role. Resolve roles manually before running bootstrap."
    );
  }

  if (input) {
    warnings.push(
      "Auth users already exist, so the provided bootstrap admin credentials were ignored."
    );
  }

  return {
    status: "skipped_existing_users",
    user: toAdminSummary(adminUser),
    warnings,
  };
}

async function ensureMeter(
  seed: BootstrapManifestMeter
): Promise<BootstrapCatalogItemResult<NonNullable<Awaited<ReturnType<typeof getMeter>>>>> {
  await ensureTables();
  const db = getDb();
  const rows = await db
    .select()
    .from(meters)
    .where(eq(meters.eventName, seed.event_name))
    .orderBy(asc(meters.createdAt), asc(meters.id));

  if (rows.length > 1) {
    throw new Error(
      `Found multiple meters with event_name '${seed.event_name}'. Bootstrap cannot choose one automatically.`
    );
  }

  if (rows.length === 0) {
    const created = await createMeter(seed);
    if ("error" in created) {
      throw new Error(created.error);
    }

    return {
      status: "created",
      value: created,
    };
  }

  const existing = rows[0];
  if (existing.defaultAggregation !== seed.default_aggregation.formula) {
    throw new Error(
      `Meter '${seed.event_name}' already exists with aggregation '${existing.defaultAggregation}', expected '${seed.default_aggregation.formula}'.`
    );
  }

  const shouldUpdate =
    existing.displayName !== seed.display_name || existing.status !== "active";

  if (shouldUpdate) {
    await db
      .update(meters)
      .set({
        displayName: seed.display_name,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(meters.id, existing.id));
  }

  const meter = await getMeter(existing.id);
  if (!meter) {
    throw new Error(`Seed meter '${existing.id}' could not be reloaded`);
  }

  return {
    status: shouldUpdate ? "updated" : "existing",
    value: meter,
  };
}

async function ensureProduct(
  seed: BootstrapManifestProduct
): Promise<BootstrapCatalogItemResult<NonNullable<Awaited<ReturnType<typeof getProduct>>>>> {
  await ensureTables();
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.name, seed.name))
    .orderBy(asc(products.createdAt), asc(products.id));

  if (rows.length > 1) {
    throw new Error(
      `Found multiple products named '${seed.name}'. Bootstrap cannot choose one automatically.`
    );
  }

  if (rows.length === 0) {
    const created = await createProduct(seed);
    return {
      status: "created",
      value: created,
    };
  }

  const existing = rows[0];
  const shouldUpdate =
    existing.description !== seed.description ||
    existing.active !== seed.active ||
    !sameStringRecord(existing.metadata, seed.metadata);

  if (shouldUpdate) {
    const updated = await updateProduct(existing.id, {
      description: seed.description,
      active: seed.active,
      metadata: seed.metadata,
    });

    if (!updated) {
      throw new Error(`Seed product '${existing.id}' could not be updated`);
    }
  }

  const product = await getProduct(existing.id);
  if (!product) {
    throw new Error(`Seed product '${existing.id}' could not be reloaded`);
  }

  return {
    status: shouldUpdate ? "updated" : "existing",
    value: product,
  };
}

async function ensureCatalog(
  manifest: BootstrapManifest
): Promise<BootstrapCatalogResult> {
  const meterResults: BootstrapCatalogResult["meters"] = [];
  for (const meterSeed of manifest.meters) {
    meterResults.push(await ensureMeter(meterSeed));
  }

  const productResults: BootstrapCatalogResult["products"] = [];
  for (const productSeed of manifest.products) {
    productResults.push(await ensureProduct(productSeed));
  }

  return {
    meters: meterResults,
    products: productResults,
    warnings: [],
  };
}

export async function bootstrapAccountAndCatalog(input?: {
  admin?: BootstrapAdminInput | null;
  manifest?: BootstrapManifest;
}): Promise<BootstrapSeedResult> {
  const manifest = input?.manifest ?? bootstrapManifest;
  const adminResult = await ensureAdmin(input?.admin);
  const catalogResult = await ensureCatalog(manifest);

  return {
    admin: {
      status: adminResult.status,
      user: adminResult.user,
    },
    meters: catalogResult.meters,
    products: catalogResult.products,
    warnings: [...adminResult.warnings, ...catalogResult.warnings],
  };
}
