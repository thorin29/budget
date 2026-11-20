import { redirect } from "next/navigation";

/** Settings opens on the first page of its menu. */
export default function SettingsIndex() {
  redirect("/line-items");
}
