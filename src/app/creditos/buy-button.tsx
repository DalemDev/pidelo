"use client";

import { useActionState } from "react";
import { buyCredits, type PayMethod } from "@/app/actions/billing";

export function BuyPackButton({ packId, canUseBalance }: { packId: string; canUseBalance: boolean }) {
  const [state, action, pending] = useActionState(
    (_: unknown, formData: FormData) => buyCredits(packId, (formData.get("method") as PayMethod) ?? "CARD"),
    undefined,
  );
  return (
    <form action={action} className="mt-4 w-full space-y-2">
      <button name="method" value="CARD" disabled={pending} className="btn-primary w-full">
        {pending ? "Procesando…" : "Comprar"}
      </button>
      {canUseBalance && (
        <button name="method" value="BALANCE" disabled={pending} className="btn-secondary w-full">
          💰 Pagar con mi saldo
        </button>
      )}
      {state?.ok && <p className="text-xs text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
