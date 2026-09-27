import { getMonthView } from "@/server/month";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  try {
    const { year, month } = await params;
    return ok(await getMonthView(Number(year), Number(month)));
  } catch (error) {
    return fail(error);
  }
}
