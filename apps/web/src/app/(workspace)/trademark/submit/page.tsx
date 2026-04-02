import { SubmitGuideWorkspace } from "@/components/workspace";

export default async function TrademarkSubmitPage({
  searchParams
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const params = await searchParams;

  return <SubmitGuideWorkspace draftId={params.draftId} />;
}

