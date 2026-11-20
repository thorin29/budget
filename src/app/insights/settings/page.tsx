import { redirect } from "next/navigation";

/** Setup moved to Settings: budgets and categories, and the home value, each have their own page. */
export default async function OldSetup({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  redirect(item === "home" ? "/settings/home" : item ? `/settings/budgets?item=${encodeURIComponent(item)}` : "/settings/budgets");
}
