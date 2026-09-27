import { createAccount, listAccounts } from "@/server/accounts";
import { created, fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    return ok({ accounts: await listAccounts({ includeInactive }) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return created(await createAccount((await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}
