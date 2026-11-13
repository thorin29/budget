import { getYearView } from "@/server/year";
import { yearGridCsv } from "@/lib/year";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
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
