"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { CATEGORY_SLUGS, CITIES } from "@/lib/constants";
import { revalidatePath } from "next/cache";

export type FormState = { error?: string; ok?: string; warn?: string } | undefined;

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  // Solo rutas internas para evitar redirecciones abiertas.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/solicitudes";
}

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(60),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  city: z.enum(CITIES),
  skills: z.array(z.enum(CATEGORY_SLUGS)),
});

export async function register(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    city: formData.get("city"),
    skills: formData.getAll("skills"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { name, email, password, city, skills } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { error: "Ya existe una cuenta con ese correo" };
  }

  const user = await db.user.create({
    data: { name, email, city, skills: skills.join(","), passwordHash: await bcrypt.hash(password, 10) },
  });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos" };
  }
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  city: z.enum(CITIES),
  bio: z.string().trim().max(500),
  skills: z.array(z.enum(CATEGORY_SLUGS)),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    bio: formData.get("bio") ?? "",
    skills: formData.getAll("skills"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await db.user.update({
    where: { id: user.id },
    data: { ...parsed.data, skills: parsed.data.skills.join(",") },
  });
  revalidatePath("/", "layout");
  return { ok: "Perfil actualizado" };
}
