import { createCategory, listCategories } from "@/server/categories";
import { created, fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    return ok({ categories: await listCategories({ includeInactive }) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return created(await createCategory((await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}
