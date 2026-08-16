import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
}) {
  return (
    <div className="grid-noise flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" aria-label="Volver al inicio">
          <Wordmark />
        </Link>
        <div className="panel animate-rise mt-7 p-6">
          <p className="label-mono">{eyebrow}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">{title}</h1>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
          {children}
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  required?: boolean | undefined;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}

export function AuthSubmit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-2 flex min-h-13 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      {busy ? "PROCESANDO..." : children}
    </button>
  );
}
