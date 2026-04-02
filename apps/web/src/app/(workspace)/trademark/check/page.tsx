import { TrademarkCheckWorkspace } from "@/components/workspace";

export default async function TrademarkCheckPage({
  searchParams
}: {
  searchParams: Promise<{ categories?: string }>;
}) {
  const params = await searchParams;

  return <TrademarkCheckWorkspace presetCategories={params.categories} />;
}

