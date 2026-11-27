/** Loyalty Cards: the household's store cards, shown big with their barcode (src/server/loyalty.ts). */

import Link from "next/link";
import { barcodeSvg, FORMAT_LABELS, FORMATS, listCards } from "@/server/loyalty";
import { requireUser } from "@/server/auth";
import { CardEditor } from "./card-editor";

export const dynamic = "force-dynamic";

const formats = FORMATS.map((f) => [f, FORMAT_LABELS[f]] as [string, string]);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  await requireUser();
  const { card: openId } = await searchParams;
  const cards = await listCards();
  const open = cards.find((c) => c.id === openId) ?? null;
  const svg = open ? await barcodeSvg(open.number, open.format) : null;

  return (
    <div className="max-w-[1100px] space-y-4">
      <h1 className="font-heading text-[28px] font-bold tracking-tight">Loyalty Cards</h1>

      {open ? (
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            <Tile card={open} big />
            <div className="rounded-xl border border-line bg-white p-3 text-center">
              {svg ? <div className="mx-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-48 [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="py-6 text-sm text-muted">This number can&apos;t be drawn as {FORMAT_LABELS[open.format]}.</p>}
              <p className="tnum mt-2 text-xl font-bold tracking-[0.15em] text-black">{open.number}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Edit Card</h2>
              <Link href="/loyalty" className="text-sm font-semibold text-accent-text hover:underline">
                Close
              </Link>
            </div>
            <CardEditor key={`${open.id}-${open.imageVersion}`} card={open} formats={formats} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.id} href={`/loyalty?card=${c.id}`} className={`block rounded-2xl ${c.id === openId ? "ring-2 ring-accent ring-offset-2" : ""}`}>
            <Tile card={c} />
          </Link>
        ))}
      </div>

      <details className="rounded-2xl border border-line bg-surface p-5" open={!cards.length}>
        <summary className="cursor-pointer text-sm font-bold">Add a Card</summary>
        <div className="mt-4">
          <CardEditor card={null} formats={formats} />
        </div>
      </details>
    </div>
  );
}

/** Light colors (like white) get dark text. */
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
};

function Tile({ card, big = false }: { card: { id: string; name: string; color: string; memberName: string | null; imageVersion: number; imageType: string | null }; big?: boolean }) {
  const light = isLight(card.color);
  // A see-through image (a logo) sits whole on the card's color; a picture fills the card.
  const logo = card.imageType !== "image/jpeg";
  return (
    <div className={`relative aspect-[1.586] overflow-hidden rounded-2xl ${light ? "text-foreground ring-1 ring-line" : "text-white"}`} style={{ background: card.color }}>
      {card.imageVersion ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/loyalty/${card.id}/image?v=${card.imageVersion}`} alt={card.name} className={`absolute inset-0 size-full ${logo ? "object-contain p-[8%]" : "object-cover"}`} />
      ) : (
        <div className="flex h-full flex-col justify-between p-3">
          <span className={`ml-auto flex size-8 items-center justify-center rounded-full text-xs font-extrabold ${light ? "bg-black/10" : "bg-white/25"}`}>{initials(card.name)}</span>
          <span>
            {card.memberName ? <span className="block text-[11px] opacity-85">{card.memberName}</span> : null}
            <b className={big ? "text-xl" : "text-[15px]"}>{card.name}</b>
          </span>
        </div>
      )}
    </div>
  );
}
