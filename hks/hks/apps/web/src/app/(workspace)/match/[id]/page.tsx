import { MatchPanel } from "@/components/workspace/match";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MatchPanel initialRequestId={id} />;
}
