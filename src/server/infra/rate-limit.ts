import "server-only";
import { headers } from "next/headers";
import { RateLimitError } from "@/domain/errors";
import { db } from "@/server/db/client";

// Límites de uso guardados en PostgreSQL (tabla RateLimitEvent). Suficiente para el volumen esperado;
// si el tráfico crece, esta interfaz (consume/clear) se puede respaldar con Redis sin tocar a quien la usa.

export type RateKind = "LOGIN" | "RESET" | "REGISTER" | "AI_DRAFT" | "MESSAGE" | "OFFER" | "REQUEST";
export type Limit = { kind: RateKind; key: string; max: number; windowMinutes: number };

export const LIMITS = {
  // Por cuenta frena a quien prueba contraseñas contra un correo; por IP, a quien prueba muchas cuentas.
  login: (email: string, ip: string): Limit[] => [
    { kind: "LOGIN", key: email, max: 5, windowMinutes: 15 },
    { kind: "LOGIN", key: `ip:${ip}`, max: 20, windowMinutes: 15 },
  ],
  reset: (email: string, ip: string): Limit[] => [
    { kind: "RESET", key: email, max: 3, windowMinutes: 60 },
    { kind: "RESET", key: `ip:${ip}`, max: 10, windowMinutes: 60 },
  ],
  register: (ip: string): Limit[] => [{ kind: "REGISTER", key: `ip:${ip}`, max: 5, windowMinutes: 60 }],
  // El asistente llama a una API de pago: se limita para acotar el costo por usuario.
  aiDraft: (userId: string): Limit[] => [{ kind: "AI_DRAFT", key: userId, max: 20, windowMinutes: 60 }],
  message: (userId: string): Limit[] => [{ kind: "MESSAGE", key: userId, max: 30, windowMinutes: 1 }],
  offer: (userId: string): Limit[] => [{ kind: "OFFER", key: userId, max: 30, windowMinutes: 60 }],
  request: (userId: string): Limit[] => [{ kind: "REQUEST", key: userId, max: 10, windowMinutes: 60 }],
};

/**
 * IP del cliente. En Vercel, x-real-ip la pone la plataforma. Detrás de otro proxy, configúralo para que
 * fije x-real-ip; si no, se usa el último valor de x-forwarded-for (el que agregó el proxy más cercano),
 * nunca el primero, que lo controla el cliente.
 */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "desconocida";
}

/**
 * Registra el uso y lanza RateLimitError si se superó algún límite. Se registra antes de contar: así,
 * muchas peticiones simultáneas no pueden pasar todas antes de que la primera quede registrada.
 */
export async function consume(limits: Limit[], message: (waitMinutes: number) => string) {
  await db.rateLimitEvent.createMany({ data: limits.map(({ kind, key }) => ({ kind, key })) });

  let wait = 0;
  for (const { kind, key, max, windowMinutes } of limits) {
    const windowMs = windowMinutes * 60_000;
    const recent = await db.rateLimitEvent.findMany({
      where: { kind, key, createdAt: { gte: new Date(Date.now() - windowMs) } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      take: max + 1,
    });
    if (recent.length <= max) continue;
    // Se vuelve a poder cuando el más antiguo de los últimos `max` sale de la ventana.
    const freesAt = recent[max - 1]!.createdAt.getTime() + windowMs;
    wait = Math.max(wait, Math.max(1, Math.ceil((freesAt - Date.now()) / 60_000)));
  }

  // Limpieza ocasional: ningún límite mira más de un día atrás.
  if (Math.random() < 0.02) {
    await db.rateLimitEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } });
  }
  if (wait > 0) throw new RateLimitError(message(wait));
}

/** Perdona los eventos de una clave (p. ej. tras un login correcto o una contraseña restablecida). */
export async function clear(kind: RateKind, key: string) {
  await db.rateLimitEvent.deleteMany({ where: { kind, key } });
}
