import { redirect } from "next/navigation";

/** An older page: its settings live in Settings now. */
export default function Moved() {
  redirect("/settings/budgets?item=categories");
}
