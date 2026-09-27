"use client";

import { useActionState, useTransition } from "react";
import { setAutoRenew, subscribePlan, type PayMethod } from "@/app/actions/billing";

export function SubscribeButton({
  planId,
  label,
  primary,
  canUseBalance,
}: {
  planId: string;
  label: string;
  primary?: boolean;
  canUseBalance?: boolean;
}) {
  const [state, action, pending] = useActionState(
    (_: unknown, formData: FormData) => subscribePlan(planId, (formData.get("method") as PayMethod) ?? "CARD"),
    undefined,
  );
  return (
    <form action={action} className="space-y-2">
      <button name="method" value="CARD" disabled={pending} className={`${primary ? "btn-primary" : "btn-secondary"} w-full`}>
        {pending ? "Procesando…" : label}
      </button>
      {canUseBalance && (
        <button name="method" value="BALANCE" disabled={pending} className="btn-secondary w-full">
          💰 Pagar con mi saldo
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
