"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "",
  variant = "primary",
  pendingText = "Enviando…",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} ${className}`}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string; warn?: string } | undefined }) {
  if (state?.error) {
    return <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>;
  }
  if (state?.warn) {
    return <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠️ {state.warn}</p>;
  }
  if (state?.ok) {
    return <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>;
  }
  return null;
}
