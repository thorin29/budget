import { redirect } from "next/navigation";

/** Moved into Settings in 0.11.0; kept so old bookmarks still land. */
export default function Moved() {
  redirect("/settings/planning");
}
