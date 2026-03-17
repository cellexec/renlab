import PipelinePageShell from "./PipelinePageShell";

export default function Page({ params }: { params: Promise<{ runId: string }> }) {
  return <PipelinePageShell params={params} />;
}
