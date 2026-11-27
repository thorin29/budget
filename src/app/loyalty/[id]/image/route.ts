import { requireUser } from "@/server/auth";
import { cardImage } from "@/server/loyalty";

export const dynamic = "force-dynamic";

/** A loyalty card's image, for the web page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const img = await cardImage(id);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(img.bytes), { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=31536000, immutable" } });
}
