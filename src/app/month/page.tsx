import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Sends /month to the current one. */
export default function MonthIndex() {
  const now = new Date();
  redirect(`/month/${now.getFullYear()}/${now.getMonth() + 1}`);
}
