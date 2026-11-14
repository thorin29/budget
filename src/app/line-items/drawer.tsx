"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/icons";

/** A panel over the right edge. Closing is navigation, so Back works too. */
export function Drawer({
  closeHref,
  title,
  children,
}: {
  closeHref: string;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="relative flex h-full w-full max-w-[560px] flex-col bg-surface shadow-pop"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="drawer-title" className="truncate text-lg font-bold">
            {title}
          </h2>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-neutral-soft hover:text-foreground"
          >
            <Icon name="x" size={20} />
          </Link>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
