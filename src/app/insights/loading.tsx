import { InsightsTabs } from "@/components/insights-tabs";
import { PageLoading } from "@/components/page-loading";

export default function Loading() {
  return (
    <div className="space-y-6">
      <InsightsTabs />
      <PageLoading />
    </div>
  );
}
