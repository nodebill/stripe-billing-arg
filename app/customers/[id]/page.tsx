import { CustomerDetailView } from "./_components/customer-detail-view";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <CustomerDetailView customerId={id} />
    </div>
  );
}
