import OrdersTable from "@/components/OrdersTable/OrdersTable";
import { PageHeader } from "@/components/PageHeader/PageHeader";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Orders"
        description="Sales saved from Billing POS appear here with payment mode and totals. Stock is reduced when a bill is generated."
      />
      <div className="min-h-0 flex-1">
        <OrdersTable initialSearch={typeof q === "string" ? q : ""} />
      </div>
    </div>
  );
}
