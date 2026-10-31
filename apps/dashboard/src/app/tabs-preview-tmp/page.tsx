// TEMPORARY check for the page tabs and the list bottom gap. Delete this folder after use.
import { TabsPreview } from "./TabsPreview";

export default async function TabsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <TabsPreview view={view ?? "products"} />;
}
