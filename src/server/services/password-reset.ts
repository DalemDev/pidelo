import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { ValidationError } from "@/domain/errors";
import { createSession, revokeAllSessions } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { appUrl, sendMail } from "@/server/infra/mail";
import { LIMITS, clear, clientIp, consume } from "@/server/infra/rate-limit";
import { BCRYPT_ROUNDS } from "./accounts";
import { audit } from "./audit";

// Recuperación de contraseña por correo: enlace de un solo uso que vence en una hora.

export const RESET_TTL_MINUTES = 60;

// Solo se guarda el hash: quien lea la base no puede usar los enlaces.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Busca un enlace de recuperación vigente (sin usar y sin vencer). */
export async function findValidReset(token: string) {
  if (!token || token.length > 100) return null;
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true, deletedAt: true } } },
  });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.deletedAt) return null;
  return reset;
}

/** Envía el enlace si la cuenta existe. La respuesta al usuario es la misma en ambos casos. */
export async function requestPasswordReset(email: string) {
  await consume(LIMITS.reset(email, await clientIp()), (m) => `Ya pediste varios enlaces. Espera ${m} min antes de pedir otro.`);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, deletedAt: true } });
  if (!user || user.deletedAt) return;

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
}

/** Cambia la contraseña con un enlace válido, cierra todas las sesiones y abre una nueva. */
export async function resetPassword(token: string, password: string) {
  const reset = await findValidReset(token);
  if (!reset) throw new ValidationError("El enlace venció o ya se usó. Pide uno nuevo.");

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.$transaction(async (tx) => {
    // Condicionado: si el enlace se usa dos veces a la vez, solo una cambia la contraseña.
    const { count } = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!count) throw new ValidationError("El enlace venció o ya se usó. Pide uno nuevo.");
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId, usedAt: null } });
    // Cierra las sesiones abiertas en otros dispositivos (por si alguien más entró).
    await revokeAllSessions(reset.userId, tx);
    await audit({ actorId: reset.userId, action: "password.reset", entity: "User", entityId: reset.userId }, tx);
  });

  // La cuenta recuperada no debe seguir bloqueada por los intentos fallidos que llevaron a recuperarla.
  await clear("LOGIN", reset.user.email);
  await createSession(reset.userId);
}
