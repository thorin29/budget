import { getYearView } from "@/server/year";
import { yearGridCsv } from "@/lib/year";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
  // The proxy already requires sign-in here; checking again keeps one gap from opening it.
  try {
    await requireUser();
  } catch {
    return new Response("Sign in required", { status: 401 });
  }
  const { year: raw } = await context.params;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    return new Response("Unknown year", { status: 404 });
  }

  const view = await getYearView(year);
  return new Response(yearGridCsv(view), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
