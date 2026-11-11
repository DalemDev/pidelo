import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

export const RESET_TTL_MINUTES = 60;

// Solo se guarda el hash: quien lea la base no puede usar los enlaces.
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Busca un enlace de recuperación vigente (sin usar y sin vencer). */
export async function findValidReset(token: string) {
  if (!token || token.length > 100) return null;
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true } } },
  });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return null;
  return reset;
}
