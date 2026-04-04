export type StripeList<T> = {
  object: "list";
  data: T[];
  has_more: boolean;
  url: string;
};
