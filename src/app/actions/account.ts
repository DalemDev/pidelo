"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { runAction, type FormState } from "@/server/http/action";
import * as accounts from "@/server/services/accounts";

// Derechos del titular de datos: eliminar la cuenta. (La exportación es un GET en /api/cuenta/exportar.)

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser("/cuenta");
  let done = false;
  const state = await runAction("deleteAccount", async () => {
    if (formData.get("confirm") !== "ELIMINAR") return { error: 'Escribe ELIMINAR para confirmar' };
    await accounts.deleteAccount(actor, String(formData.get("password") ?? ""));
    done = true;
  });
  if (done) {
    (await cookies()).delete("pidelo_session");
    redirect("/?cuenta=eliminada");
  }
  return state;
}
