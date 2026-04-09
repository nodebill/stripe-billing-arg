import type { Meter } from "@/modules/meters/types";
import type { Product } from "@/modules/products/types";

export type BootstrapManifestMeter = {
  display_name: string;
  event_name: string;
  default_aggregation: { formula: "sum" | "count" };
};

export type BootstrapManifestProduct = {
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, string>;
};

export type BootstrapManifest = {
  meters: BootstrapManifestMeter[];
  products: BootstrapManifestProduct[];
};

export type BootstrapAdminInput = {
  email: string;
  name: string;
  password: string;
};

export type BootstrapAdminSummary = {
  id: string;
  email: string;
  name: string;
  role: string | null;
};

export type BootstrapAdminResult = {
  status: "created" | "skipped_existing_users";
  user: BootstrapAdminSummary | null;
};

export type BootstrapCatalogItemStatus = "created" | "existing" | "updated";

export type BootstrapCatalogItemResult<T> = {
  status: BootstrapCatalogItemStatus;
  value: T;
};

export type BootstrapCatalogResult = {
  meters: BootstrapCatalogItemResult<Meter>[];
  products: BootstrapCatalogItemResult<Product>[];
  warnings: string[];
};

export type BootstrapSeedResult = BootstrapCatalogResult & {
  admin: BootstrapAdminResult;
};
