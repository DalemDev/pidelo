"use client";

import { useActionState } from "react";
import { submitReceipt } from "@/app/actions/payments";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function ReceiptForm({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState(submitReceipt.bind(null, paymentId), undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="method">Método</label>
          <select className="input" id="method" name="method" defaultValue="TRANSFER">
            <option value="TRANSFER">Transferencia bancaria</option>
            <option value="DEUNA">DeUna</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="reference">N.º de comprobante (opcional)</label>
          <input className="input" id="reference" name="reference" maxLength={100} placeholder="Ej: 123456789" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="receipt">Foto o PDF del comprobante</label>
        <input
          className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700"
          id="receipt"
          name="receipt"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
        <p className="mt-1 text-xs text-zinc-500">Máximo 5 MB. Debe verse el monto, la fecha y el código de pago.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Subiendo…">Enviar comprobante</SubmitButton>
    </form>
  );
}
