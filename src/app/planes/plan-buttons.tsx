"use client";

import { useActionState, useTransition } from "react";
import { cancelPlanChange, setAutoRenew, subscribePlan, type PayMethod } from "@/app/actions/billing";

export function SubscribeButton({
  planId,
  label,
  note,
  primary,
  canUseBalance,
  cardEnabled,
  free,
}: {
  planId: string;
  label: string;
  note?: string;
  primary?: boolean;
  canUseBalance?: boolean;
  // Sin pasarela de pago integrada, la tarjeta solo está disponible en el entorno de pruebas.
  cardEnabled: boolean;
  // Cambios sin cobro (bajar de plan): el botón principal siempre se muestra.
  free?: boolean;
}) {
  const showMain = free || cardEnabled;
  const [state, action, pending] = useActionState(
    (_: unknown, formData: FormData) => subscribePlan(planId, (formData.get("method") as PayMethod) ?? "CARD"),
    undefined,
  );
  return (
    <form action={action} className="space-y-2">
      {note && <p className="text-xs text-zinc-500">{note}</p>}
      {showMain && (
        <button name="method" value="CARD" disabled={pending} className={`${primary ? "btn-primary" : "btn-secondary"} w-full`}>
          {pending ? "Procesando…" : label}
        </button>
      )}
      {!free && (canUseBalance || !showMain) && (
        <button name="method" value="BALANCE" disabled={pending || !canUseBalance} className={`${showMain ? "btn-secondary" : primary ? "btn-primary" : "btn-secondary"} w-full`}>
          {!canUseBalance ? "Saldo insuficiente" : showMain ? "Pagar con mi saldo" : `${label} con mi saldo`}
        </button>
      )}
      {state?.ok && <p className="mt-2 text-center text-xs text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="mt-2 text-center text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

export function AutoRenewToggle({ autoRenew }: { autoRenew: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => setAutoRenew(!autoRenew))} className="btn-secondary">
      {pending ? "…" : autoRenew ? "Cancelar renovación" : "Reactivar renovación"}
    </button>
  );
}

export function CancelChangeButton() {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => cancelPlanChange())} className="btn-secondary">
      {pending ? "…" : "Mantener mi plan"}
    </button>
  );
}
