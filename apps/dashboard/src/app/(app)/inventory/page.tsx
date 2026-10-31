import { redirect } from "next/navigation";

/** The inventory list is now the Stock tab of Products; old links and bookmarks land there. */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { filter } = await searchParams;
  redirect(
    filter === "low-stock" ? "/products?tab=stock&filter=low-stock" : "/products?tab=stock",
  );
}
