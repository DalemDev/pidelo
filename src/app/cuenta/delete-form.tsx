"use client";

import { useActionState } from "react";
import { deleteAccount } from "@/app/actions/account";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, undefined);
  return (
    <form action={action} className="mt-4 space-y-3">
      <div>
        <label className="label" htmlFor="password">Tu contraseña</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Escribe <b>ELIMINAR</b> para confirmar
        </label>
        <input className="input" id="confirm" name="confirm" autoComplete="off" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingText="Eliminando…">Eliminar mi cuenta</SubmitButton>
    </form>
  );
}
