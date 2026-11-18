import { redirect } from "next/navigation";

/** Budget setup moved to Insights → Settings. */
export default function EnvelopeSetupPage() {
  redirect("/insights/settings");
}
