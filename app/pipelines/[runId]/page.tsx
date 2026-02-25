import PipelinePageShell from "./PipelinePageShell";
import { StepDesign18 } from "./step-designs";

export default function Page({ params }: { params: Promise<{ runId: string }> }) {
  return <PipelinePageShell params={params} StepDesignComponent={StepDesign18} />;
}
