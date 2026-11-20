import { redirect } from "next/navigation";

/** An older page: its settings live in Settings now. */
export default function Moved() {
  redirect("/line-items");
}
