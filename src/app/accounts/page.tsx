import { redirect } from "next/navigation";

/** Accounts moved into Settings. */
export default async function OldAccounts({ searchParams }: { searchParams: Promise<{ g?: string; edit?: string }> }) {
  const { g, edit } = await searchParams;
  const q = new URLSearchParams({ ...(g ? { g } : {}), ...(edit ? { edit } : {}) }).toString();
  redirect(`/settings/accounts${q ? `?${q}` : ""}`);
}
