import { redirect } from "next/navigation";

/** Editing moved into a panel on the list in 0.11.0. */
export default async function EditLineItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/line-items?edit=${encodeURIComponent(id)}`);
}
