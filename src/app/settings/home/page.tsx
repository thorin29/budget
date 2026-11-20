import { SectionHeading } from "@/components/ui";
import { homeValue } from "@/server/home-value";
import { HomePanel } from "../../insights/settings/setup-panel";

export const dynamic = "force-dynamic";

/** Settings › Home & net worth: the home value that net worth uses. */
export default async function HomeSettings() {
  const home = await homeValue().catch(() => null);
  return (
    <div className="space-y-4">
      <SectionHeading title="Home & net worth" description="Accounts come from the bank feed; the home's value is set here and counted in net worth on Insights › Debt & net worth." />
      <HomePanel home={home} />
    </div>
  );
}
