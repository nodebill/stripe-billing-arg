export type Product = {
  id: string;
  object: "product";
  name: string;
  active: boolean;
  description: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
  created: number;
  updated: number;
};

export type CreateProductInput = {
  name: string;
  description?: string;
  active?: boolean;
  metadata?: Record<string, string>;
};

export type UpdateProductInput = {
  name?: string;
  description?: string | null;
  active?: boolean;
  metadata?: Record<string, string>;
};

export type DeletedProduct = {
  id: string;
  object: "product";
  deleted: true;
};

export type ListProductsParams = {
  limit?: number;
  active?: boolean;
  starting_after?: string;
  ending_before?: string;
};

export type StripeList<T> = {
  object: "list";
  data: T[];
  has_more: boolean;
  url: string;
};
