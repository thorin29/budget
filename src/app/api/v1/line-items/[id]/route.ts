import { deleteLineItem, getLineItem, updateLineItem } from "@/server/line-items";
import { fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return ok(await getLineItem((await params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    return ok(await updateLineItem((await params).id, (await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    return ok(await deleteLineItem((await params).id));
  } catch (error) {
    return fail(error);
  }
}
