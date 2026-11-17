import { requireDevice } from "@/server/device-auth";
import { getCategoryDetail } from "@/server/category-detail";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** One category up close: twelve months, this month's merchants and charges. `?id=<category id|none>&m=YYYY-MM`. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const p = new URL(request.url).searchParams;
    const now = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).format(new Date());
    const [y, m] = (p.get("m") && /^\d{4}-\d{2}$/.test(p.get("m")!) ? p.get("m")! : now).split("-").map(Number);
    return ok(await getCategoryDetail(String(p.get("id") || "none"), y, m));
  } catch (error) {
    return fail(error);
  }
}
