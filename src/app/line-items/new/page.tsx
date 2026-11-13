import { redirect } from "next/navigation";

/** Adding moved into a panel on the list in 0.11.0. */
export default function NewLineItem() {
  redirect("/line-items?edit=new");
}
