import ResearchInsights from "@/components/ResearchInsights";

interface InsightsPanelProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}

export default function InsightsPanel({ currentThreadId, onThreadSelect, onNewThread }: InsightsPanelProps) {
  return (
    <div className="max-w-6xl mx-auto">
      <ResearchInsights />
    </div>
  );
}