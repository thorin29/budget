"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCardAction, saveCardAction, setImageAction } from "./actions";

export const COLORS = ["#7c2d12", "#b91c1c", "#b45309", "#166534", "#0f766e", "#1e3a8a", "#2851d6", "#6b21a8", "#be185d", "#334155", "#111827"];

export interface EditorCard {
  id: string;
  name: string;
  number: string;
  format: string;
  color: string;
  memberName: string | null;
  imageVersion: number;
}

/** Shrinks a photo to at most 1000 px wide, as JPEG, before it's sent. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((ok) => canvas.toBlob((b) => ok(b!), "image/jpeg", 0.85));
}

/** Add or change a loyalty card: store, number, barcode type, member, and its look. */
export function CardEditor({ card, formats, onDone }: { card: EditorCard | null; formats: Array<[string, string]>; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(card?.name ?? "");
  const [number, setNumber] = useState(card?.number ?? "");
  const [format, setFormat] = useState(card?.format ?? "");
  const [memberName, setMemberName] = useState(card?.memberName ?? "");
  const [color, setColor] = useState(card?.color ?? COLORS[9]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  const save = () =>
    start(async () => {
      setNote(null);
      const r = await saveCardAction(card?.id ?? null, { name, number: number.trim(), format, color, memberName });
      if (!r.ok) return setNote(r.message);
      const picked = file.current?.files?.[0];
      if (picked && r.id) {
        const form = new FormData();
        form.set("image", await shrink(picked), "card.jpg");
        const up = await setImageAction(r.id, form);
        if (!up.ok) return setNote(up.message);
      }
      router.refresh();
      onDone?.();
      if (!card) {
        setName("");
        setNumber("");
        setMemberName("");
        if (file.current) file.current.value = "";
      }
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-muted">Store</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-muted">Member (optional)</span>
          <input value={memberName} onChange={(e) => setMemberName(e.target.value)} maxLength={40} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-muted">Card number</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} className={`${input} tnum`} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-muted">Barcode type</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={input}>
            <option value="">From the number</option>
            {formats.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-xs font-semibold text-muted">Look</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className={`size-7 rounded-full ${color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`} style={{ background: c }} />
          ))}
          <label className="ml-2 cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold">
            {card?.imageVersion ? "Replace image…" : "Add an image…"}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" />
          </label>
          {card?.imageVersion ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await setImageAction(card.id, new FormData());
                  router.refresh();
                })
              }
              className="text-xs font-semibold text-muted hover:text-foreground"
            >
              Remove image
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {note ? <span className="text-xs text-warn">{note}</span> : null}
        {card ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              start(async () => {
                if (!window.confirm(`Delete the ${card.name} card?`)) return;
                await deleteCardAction(card.id);
                router.push("/loyalty");
              })
            }
            className="ml-auto text-xs font-semibold text-muted hover:text-foreground"
          >
            Delete card
          </button>
        ) : null}
        <button type="button" disabled={busy || !name.trim() || !number.trim()} onClick={save} className={`${card ? "" : "ml-auto"} rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent`}>
          {card ? "Save changes" : "Add card"}
        </button>
      </div>
    </div>
  );
}
