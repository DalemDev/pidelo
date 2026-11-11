"use client";

import { useActionState } from "react";
import { buyCredits, type PayMethod } from "@/app/actions/billing";

// Sin pasarela de pago integrada, la tarjeta solo está disponible en el entorno de pruebas (cardEnabled).
export function BuyPackButton({ packId, canUseBalance, cardEnabled }: { packId: string; canUseBalance: boolean; cardEnabled: boolean }) {
  const [state, action, pending] = useActionState(
    (_: unknown, formData: FormData) => buyCredits(packId, (formData.get("method") as PayMethod) ?? "CARD"),
    undefined,
  );
  return (
    <form action={action} className="mt-4 w-full space-y-2">
      {cardEnabled && (
        <button name="method" value="CARD" disabled={pending} className="btn-primary w-full">
          {pending ? "Procesando…" : "Comprar con tarjeta"}
        </button>
      )}
      {(canUseBalance || !cardEnabled) && (
        <button name="method" value="BALANCE" disabled={pending || !canUseBalance} className={`${cardEnabled ? "btn-secondary" : "btn-primary"} w-full`}>
          {canUseBalance ? "Pagar con mi saldo" : "Saldo insuficiente"}
        </button>
      )}
      {state?.ok && <p className="text-xs text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}
