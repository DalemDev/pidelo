import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

// Límite de intentos guardado en la base (sin Redis): suficiente para login y recuperación de contraseña,
// que son de bajo volumen. Cada intento es una fila; las viejas se borran al registrar nuevas.

export type Limit = { kind: "LOGIN" | "RESET"; key: string; max: number; windowMinutes: number };

export const LOGIN_LIMITS = (email: string, ip: string): Limit[] => [
  // Por cuenta: frena a quien prueba contraseñas contra un correo.
  { kind: "LOGIN", key: email, max: 5, windowMinutes: 15 },
  // Por IP: frena a quien prueba muchas cuentas desde el mismo lugar.
  { kind: "LOGIN", key: `ip:${ip}`, max: 20, windowMinutes: 15 },
];

export const RESET_LIMITS = (email: string, ip: string): Limit[] => [
  { kind: "RESET", key: email, max: 3, windowMinutes: 60 },
  { kind: "RESET", key: `ip:${ip}`, max: 10, windowMinutes: 60 },
];

/** IP del cliente según el proxy (Vercel envía x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
}

/** Minutos que faltan para poder reintentar; 0 si todavía quedan intentos en todos los límites. */
export async function retryAfterMinutes(limits: Limit[]) {
  let wait = 0;
  for (const { kind, key, max, windowMinutes } of limits) {
    const windowMs = windowMinutes * 60_000;
    const attempts = await db.authAttempt.findMany({
      where: { kind, key, createdAt: { gte: new Date(Date.now() - windowMs) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      take: max,
    });
    if (attempts.length < max) continue;
    // Se libera un intento cuando el más antiguo de la ventana sale de ella.
    const freesAt = attempts[0]!.createdAt.getTime() + windowMs;
    wait = Math.max(wait, Math.ceil((freesAt - Date.now()) / 60_000));
  }
  return wait;
}

export async function recordAttempt(limits: Limit[]) {
  await db.authAttempt.createMany({ data: limits.map(({ kind, key }) => ({ kind, key })) });
  // Limpieza: nada de lo que se cuenta tiene más de un día.
  await db.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } });
}

/** Tras un login correcto se perdonan los intentos fallidos de esa cuenta (no los de la IP). */
export async function clearAttempts(kind: Limit["kind"], key: string) {
  await db.authAttempt.deleteMany({ where: { kind, key } });
}
