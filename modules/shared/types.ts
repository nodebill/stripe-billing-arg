export type StripeList<T> = {
  object: "list";
  data: T[];
  has_more: boolean;
  total_count?: number;
  url: string;
};

export type StripeSearchResult<T> = {
  object: "search_result";
  data: T[];
  has_more: boolean;
  next_page: string | null;
  url: string;
};
