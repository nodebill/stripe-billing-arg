import { MeterDetailView } from "./_components/meter-detail-view";

export default async function BillingMeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <MeterDetailView meterId={id} />
    </div>
  );
}
