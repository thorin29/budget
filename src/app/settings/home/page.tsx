import { SectionHeading } from "@/components/ui";
import { homeValue } from "@/server/home-value";
import { HomePanel } from "../../insights/settings/setup-panel";

export const dynamic = "force-dynamic";

/** Settings › Property Management: each home's value, counted in net worth. */
export default async function HomeSettings({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const { home: id } = await searchParams;
  const home = await homeValue(id || "home").catch(() => null);
  return (
    <div className="space-y-4">
      <SectionHeading title="Property Management" />
      <HomePanel key={home?.id ?? "home"} home={home} />
    </div>
  );
}
