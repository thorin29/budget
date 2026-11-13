/**
 * Shared layout and form primitives. Every colour comes from the theme tokens
 * in globals.css, so these render correctly in either look and either mode.
 */

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface shadow-card ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {description ? <p className="mt-1 max-w-prose text-sm text-muted">{description}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && !error?.length ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
      {error?.length ? (
        <span className="mt-1.5 block text-xs text-danger">{error.join(". ")}</span>
      ) : null}
    </label>
  );
}

export const CONTROL =
  "w-full rounded-[10px] border border-line-strong bg-field px-3 py-2 text-sm text-foreground " +
  "outline-none transition placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/20";

export function TextInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export const BUTTON_STYLES = {
  primary: "bg-accent text-white hover:brightness-95 shadow-card",
  quiet: "border border-line-strong bg-surface text-foreground hover:bg-neutral-soft",
  danger: "text-danger hover:bg-danger-soft",
  ghost: "text-muted hover:bg-neutral-soft hover:text-foreground",
} as const;

export function buttonClass(variant: keyof typeof BUTTON_STYLES = "primary", extra = "") {
  return (
    "inline-flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2 text-sm font-semibold " +
    `transition disabled:opacity-50 ${BUTTON_STYLES[variant]} ${extra}`
  );
}

export function Button({
  variant = "primary",
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof BUTTON_STYLES }) {
  return <button {...props} className={buttonClass(variant, props.className ?? "")} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-5 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{message}</div>
  );
}

const PILL_TONES = {
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-neutral-soft text-neutral",
  info: "bg-info-soft text-info",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "accent",
  className = "",
}: {
  value: number;
  max: number;
  tone?: "accent" | "info";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-neutral-soft ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className={`h-full rounded-full ${tone === "info" ? "bg-info" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "default",
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "hero" | "danger";
  children?: ReactNode;
}) {
  const hero = tone === "hero";
  return (
    <div
      className={`rounded-2xl p-5 ${
        hero
          ? "bg-hero text-hero-text"
          : "border border-line bg-surface shadow-card"
      }`}
    >
      <p className={`text-[13px] font-medium ${hero ? "text-hero-muted" : "text-muted"}`}>{label}</p>
      <p
        className={`tnum font-heading mt-1.5 text-[26px] font-bold leading-tight tracking-tight ${
          tone === "danger" ? "text-danger" : ""
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className={`tnum mt-1 text-xs ${hero ? "text-hero-muted" : "text-muted"}`}>{detail}</p>
      ) : null}
      {children}
    </div>
  );
}

/** A row of radio buttons that reads as one control. Works without script. */
export function Segmented({
  name,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-[10px] bg-neutral-soft p-1" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="flex-1">
          <input
            type="radio"
            name={name}
            value={o.value}
            className="peer sr-only"
            checked={value === undefined ? undefined : value === o.value}
            defaultChecked={value === undefined ? defaultValue === o.value : undefined}
            onChange={onChange ? () => onChange(o.value) : undefined}
          />
          <span className="block cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm font-medium text-muted transition peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
