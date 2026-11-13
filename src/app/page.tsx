import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The month view is home. It carries its own first-run guidance. */
export default function Home() {
  redirect("/month");
}
