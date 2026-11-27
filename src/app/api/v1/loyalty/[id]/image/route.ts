import { requireDevice } from "@/server/device-auth";
import { cardImage, setImage } from "@/server/loyalty";
import { fail, ok } from "@/server/http";
import { NotFoundError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** The card's image. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    const img = await cardImage(id);
    if (!img) throw new NotFoundError("Image");
    return new Response(Buffer.from(img.bytes), { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (error) {
    return fail(error);
  }
}

/** Sets the card's image: the body is the JPEG, PNG or WebP itself (up to 2 MB). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    return ok(await setImage(id, new Uint8Array(await request.arrayBuffer())));
  } catch (error) {
    return fail(error);
  }
}

/** Removes the card's image. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    return ok(await setImage(id, null));
  } catch (error) {
    return fail(error);
  }
}
