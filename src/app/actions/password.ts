"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db/client";
import { createSession } from "@/server/auth/session";
import { appUrl, sendMail } from "@/server/infra/mail";
import { RESET_TTL_MINUTES, findValidReset, hashToken } from "@/server/services/password-reset";
import { RESET_LIMITS, clearAttempts, clientIp, recordAttempt, retryAfterMinutes } from "@/server/infra/rate-limit";
import type { FormState } from "./auth";

// Mismo mensaje exista o no la cuenta: así el formulario no sirve para averiguar qué correos están registrados.
const SENT = "Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña. Revisa también tu carpeta de spam.";

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.string().trim().toLowerCase().email("Correo inválido").safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const email = parsed.data;

  const limits = RESET_LIMITS(email, await clientIp());
  const wait = await retryAfterMinutes(limits);
  if (wait > 0) return { error: `Ya pediste varios enlaces. Espera ${wait} min antes de pedir otro.` };
  await recordAttempt(limits);

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return { ok: SENT };

  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    // Un solo enlace vigente por cuenta: pedir uno nuevo anula los anteriores.
    db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordReset.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    }),
  ]);

  const link = `${await appUrl()}/recuperar/${token}`;
  await sendMail({
    to: email,
    subject: "Crea una nueva contraseña en Pídelo",
    text: `Hola, ${user.name}:\n\nPara crear una nueva contraseña abre este enlace (vence en ${RESET_TTL_MINUTES} minutos):\n${link}\n\nSi no lo pediste, ignora este correo: tu contraseña no cambia.`,
    html: `<p>Hola, ${escapeHtml(user.name)}:</p><p>Para crear una nueva contraseña haz clic aquí (vence en ${RESET_TTL_MINUTES} minutos):</p><p><a href="${link}">Crear nueva contraseña</a></p><p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>`,
  });
  return { ok: SENT };
}

const ResetSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden" });

export async function resetPassword(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = ResetSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const reset = await findValidReset(token);
  if (!reset) return { error: "El enlace venció o ya se usó. Pide uno nuevo." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const used = await db.$transaction(async (tx) => {
    // Condicionado: si el enlace se usa dos veces a la vez, solo una cambia la contraseña.
    const { count } = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!count) return false;
    // sessionsValidAfter cierra las sesiones abiertas en otros dispositivos (por si alguien más entró).
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash, sessionsValidAfter: new Date() } });
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId, usedAt: null } });
    return true;
  });
  if (!used) return { error: "El enlace venció o ya se usó. Pide uno nuevo." };

  // La cuenta recuperada no debe seguir bloqueada por los intentos fallidos que llevaron a recuperarla.
  await clearAttempts("LOGIN", reset.user.email);
  await createSession(reset.userId);
  redirect("/solicitudes");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
