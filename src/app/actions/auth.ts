"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LoginSchema, ProfileSchema, RegisterSchema } from "@/domain/schemas";
import { destroySession, requireUser } from "@/server/auth/session";
import { parseInput, runAction, type FormState } from "@/server/http/action";
import * as accounts from "@/server/services/accounts";

export type { FormState };

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  // Solo rutas internas para evitar redirecciones abiertas.
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/solicitudes";
}

export async function register(_: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runAction("register", async () => {
    const input = parseInput(RegisterSchema, {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      city: formData.get("city"),
      skills: formData.getAll("skills"),
      acceptTerms: formData.get("acceptTerms") === "on",
      adult: formData.get("adult") === "on",
    });
    await accounts.register(input);
    done = true;
  });
  if (done) redirect(safeNext(formData.get("next")));
  return state;
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runAction("login", async () => {
    const { email, password } = parseInput(LoginSchema, { email: formData.get("email"), password: formData.get("password") });
    await accounts.login(email, password);
    done = true;
  });
  if (done) redirect(safeNext(formData.get("next")));
  return state;
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  return runAction("updateProfile", async () => {
    const input = parseInput(ProfileSchema, {
      name: formData.get("name"),
      city: formData.get("city"),
      bio: formData.get("bio") ?? "",
      skills: formData.getAll("skills"),
    });
    const { warning } = await accounts.updateProfile(actor, input);
    revalidatePath("/", "layout");
    return warning ? { warn: warning } : { ok: "Perfil actualizado" };
  });
}
