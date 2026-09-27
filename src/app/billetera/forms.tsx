"use client";

import { useActionState } from "react";
import { requestPayout, saveBankAccount } from "@/app/actions/payments";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { MIN_PAYOUT_CENTS, fmtCents } from "@/lib/money";

export function PayoutForm({ withdrawable }: { withdrawable: number }) {
  const [state, action] = useActionState(requestPayout, undefined);
  const canWithdraw = withdrawable >= MIN_PAYOUT_CENTS;
  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
          <input
            className="input pl-7"
            name="amount"
            type="number"
            step="0.01"
            min={MIN_PAYOUT_CENTS / 100}
            max={withdrawable / 100}
            defaultValue={canWithdraw ? (withdrawable / 100).toFixed(2) : ""}
            disabled={!canWithdraw}
            aria-label="Monto a retirar"
            required
          />
        </div>
        <SubmitButton pendingText="Solicitando…">Retirar</SubmitButton>
      </div>
      {!canWithdraw && (
        <p className="text-xs text-zinc-500">Necesitas al menos {fmtCents(MIN_PAYOUT_CENTS)} retirables (tienes {fmtCents(withdrawable)}).</p>
      )}
      <FormMessage state={state} />
    </form>
  );
}

type Bank = {
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankHolderName: string;
  bankHolderId: string;
};

export function BankForm({ bank }: { bank: Bank }) {
  const [state, action] = useActionState(saveBankAccount, undefined);
  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bankName">Banco</label>
          <input className="input" id="bankName" name="bankName" list="banks" defaultValue={bank.bankName} required />
          <datalist id="banks">
            {["Banco Pichincha", "Banco Guayaquil", "Produbanco", "Banco del Pacífico", "Banco Internacional", "Banco Bolivariano", "Cooperativa JEP"].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="bankAccountType">Tipo de cuenta</label>
          <select className="input" id="bankAccountType" name="bankAccountType" defaultValue={bank.bankAccountType}>
            <option value="AHORROS">Ahorros</option>
            <option value="CORRIENTE">Corriente</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bankAccountNumber">Número de cuenta</label>
        <input className="input" id="bankAccountNumber" name="bankAccountNumber" inputMode="numeric" defaultValue={bank.bankAccountNumber} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bankHolderName">Titular</label>
          <input className="input" id="bankHolderName" name="bankHolderName" defaultValue={bank.bankHolderName} required />
        </div>
        <div>
          <label className="label" htmlFor="bankHolderId">Cédula o RUC</label>
          <input className="input" id="bankHolderId" name="bankHolderId" inputMode="numeric" defaultValue={bank.bankHolderId} required />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Guardar cuenta</SubmitButton>
    </form>
  );
}
