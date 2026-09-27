"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import type { FormState } from "@/app/actions/auth";

/** Formulario genérico del panel: recibe una Server Action ya "bindeada" con el id del recurso. */
export function ActionForm({
  action,
  label,
  variant = "primary",
  children,
  className = "",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={formAction} className={`space-y-2 ${className}`}>
      {children}
      <FormMessage state={state} />
      <SubmitButton variant={variant} pendingText="Procesando…">
        {label}
      </SubmitButton>
    </form>
  );
}

export function ResolveFields({ heldCents }: { heldCents: number }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["RELEASE", "Liberar al proveedor"],
          ["REFUND", "Reembolsar todo"],
          ["SPLIT", "Reparto parcial"],
        ].map(([v, l]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
            <input type="radio" name="resolution" value={v} required className="accent-brand-600" /> {l}
          </label>
        ))}
      </div>
      <input
        className="input"
        name="refund"
        type="number"
        step="0.01"
        min={0.01}
        max={heldCents / 100}
        placeholder={`Reembolso al cliente si es parcial (máx. $${(heldCents / 100).toFixed(2)})`}
      />
      <input className="input" name="note" maxLength={500} placeholder="Nota para ambas partes (se envía en la notificación)" />
    </>
  );
}
