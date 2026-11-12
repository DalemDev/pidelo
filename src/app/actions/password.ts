"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ResetPasswordSchema } from "@/domain/schemas";
import { parseInput, runAction, type FormState } from "@/server/http/action";
import * as passwordReset from "@/server/services/password-reset";

// Mismo mensaje exista o no la cuenta: así el formulario no sirve para averiguar qué correos están registrados.
const SENT = "Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña. Revisa también tu carpeta de spam.";

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  return runAction("requestPasswordReset", async () => {
    const email = parseInput(z.string().trim().toLowerCase().max(254).email("Correo inválido"), formData.get("email"));
    await passwordReset.requestPasswordReset(email);
    return { ok: SENT };
  });
}

export async function resetPassword(token: string, _: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runAction("resetPassword", async () => {
    const { password } = parseInput(ResetPasswordSchema, { password: formData.get("password"), confirm: formData.get("confirm") });
    await passwordReset.resetPassword(token, password);
    done = true;
  });
  if (done) redirect("/solicitudes");
  return state;
}
