/**
 * Shared form and layout primitives.
 *
 * Deliberately small: enough to keep the setup screens consistent without
 * introducing a component library before there is a second consumer.
 */

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface p-5 ${className}`}
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
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
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
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error?.length ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
      {error?.length ? (
        <span className="mt-1 block text-xs text-danger">{error.join(". ")}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-md border border-line bg-field px-3 py-2 text-sm " +
  "outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function TextInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "primary",
  ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "quiet" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white hover:opacity-90",
    quiet: "border border-line bg-field hover:bg-accent-soft",
    danger: "text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${styles} ${props.className ?? ""}`}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}
