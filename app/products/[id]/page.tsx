import { ProductDetailView } from "./_components/product-detail-view";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <ProductDetailView productId={id} />
    </div>
  );
}
